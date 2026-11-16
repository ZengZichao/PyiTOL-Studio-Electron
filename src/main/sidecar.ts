/**
 * Sidecar process manager: spawns and communicates with the Python sidecar
 * via line-delimited JSON-RPC over stdio.
 *
 * Lifecycle:
 *  1. spawn() — starts the Python process, sends handshake
 *  2. call(method, params) — sends a request, awaits the matching response
 *  3. progress notifications arrive as method: "progress" lines
 *  4. on crash → auto-restart (up to 3 times), emit crash event
 *  5. dispose() — kill the process
 */

import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { existsSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'
import type {
  HandshakeParams,
  HandshakeResult,
  RpcRequest,
  RpcResponse,
  RpcProgressNotification
} from '@shared/types'

const RESTART_LIMIT = 3
const READ_TIMEOUT_MS = 300_000 // 5 min for long uploads

function getSidecarPath(): string {
  // Development: spawn from venv python
  // Production: use the bundled PyInstaller executable
  const isDev = !app.isPackaged
  if (isDev) {
    // 1. Explicit override via environment variable
    const envPython = process.env.PYITOL_STUDIO_PYTHON
    if (envPython && existsSync(envPython)) {
      return envPython
    }
    // 2. Venv discovery: walk upward from the app path (the main bundle may sit
    //    in out/main, so the repo root is a few levels up) looking for a venv,
    //    and also scan each ancestor directory's siblings. Machine-agnostic —
    //    previously this was a hardcoded absolute path.
    const candidates: string[] = []
    const seen = new Set<string>()
    let dir = app.getAppPath()
    for (let i = 0; i < 4 && dir !== dirname(dir); i++) {
      candidates.push(join(dir, '.build-venv', 'bin', 'python'))
      candidates.push(join(dir, '.venv', 'bin', 'python'))
      candidates.push(join(dir, 'venv', 'bin', 'python'))
      // Scan this level's siblings (e.g. the sibling legacy checkout)
      try {
        for (const entry of readdirSync(dirname(dir))) {
          candidates.push(join(dirname(dir), entry, '.build-venv', 'bin', 'python'))
          candidates.push(join(dirname(dir), entry, '.venv', 'bin', 'python'))
        }
      } catch {
        // not readable — ignore
      }
      dir = dirname(dir)
    }
    for (const candidate of candidates) {
      if (!seen.has(candidate) && existsSync(candidate)) {
        return candidate
      }
      seen.add(candidate)
    }
    // Fallback: system python3
    return 'python3'
  }

  const exeName = process.platform === 'win32' ? 'pyitol-sidecar.exe' : 'pyitol-sidecar'
  // onedir build: Resources/sidecar/pyitol-sidecar/pyitol-sidecar (fast startup,
  // no self-extraction). Fall back to the legacy single-file layout.
  const onedirExe = join(process.resourcesPath, 'sidecar', 'pyitol-sidecar', exeName)
  if (existsSync(onedirExe)) {
    return onedirExe
  }
  return join(process.resourcesPath, 'sidecar', exeName)
}

function getSidecarArgs(): string[] {
  const isDev = !app.isPackaged
  if (isDev) {
    const sidecarScript = join(__dirname, '..', '..', 'resources', 'sidecar', 'sidecar_main.py')
    return [sidecarScript]
  }
  return [] // PyInstaller single-file exe needs no args
}

export class SidecarManager extends EventEmitter {
  private proc: ChildProcess | null = null
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >()
  private buffer = ''
  private handshakeResult: HandshakeResult | null = null
  private restartCount = 0
  private disposed = false
  // In-flight start/spawn (or a scheduled restart) — shared so concurrent
  // callers never spawn a second sidecar process.
  private startPromise: Promise<HandshakeResult> | null = null
  private restartTimer: NodeJS.Timeout | null = null

  async start(): Promise<HandshakeResult> {
    if (this.handshakeResult) {
      return this.handshakeResult
    }
    if (this.startPromise) {
      return this.startPromise
    }
    this.startPromise = this.spawn()
      .then(() => {
        this.startPromise = null
        return this.handshakeResult!
      })
      .catch(err => {
        this.startPromise = null
        throw err
      })
    return this.startPromise
  }

  private async spawn(): Promise<void> {
    const exe = getSidecarPath()
    const args = getSidecarArgs()

    this.proc = spawn(exe, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8'
      }
    })

    this.proc.stdout?.setEncoding('utf-8')
    this.proc.stderr?.setEncoding('utf-8')

    this.proc.stdout?.on('data', (data: string) => this.onStdout(data))
    this.proc.stderr?.on('data', (data: string) => {
      // stderr is for diagnostics only; log but do not parse
      console.error('[sidecar:stderr]', data.trim())
    })

    this.proc.on('exit', (code, signal) => {
      this.onExit(code, signal)
    })

    // Handshake
    try {
      const result = await this.rawCall<HandshakeResult>('handshake', {
        client: 'pyitol-studio',
        version: app.getVersion()
      } as HandshakeParams)
      this.handshakeResult = result
      this.restartCount = 0 // reset on successful handshake
    } catch (err) {
      throw new Error(`Sidecar handshake failed: ${(err as Error).message}`)
    }
  }

  private onStdout(data: string): void {
    this.buffer += data
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed)
        this.handleMessage(msg)
      } catch {
        // Not JSON — ignore (engine debug print)
      }
    }
  }

  private handleMessage(msg: RpcResponse | RpcProgressNotification): void {
    // Progress notification
    if ('method' in msg && msg.method === 'progress') {
      const p = msg.params as { id: number; message: string; percent?: number }
      const pending = this.pending.get(p.id)
      if (pending) {
        this.emit('progress', p.message, p.percent)
      }
      return
    }

    // Response to a call
    if ('id' in msg && typeof msg.id === 'number') {
      const pending = this.pending.get(msg.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(msg.id)

      if ('error' in msg) {
        pending.reject(new Error(msg.error.message))
      } else {
        pending.resolve(msg.result)
      }
    }
  }

  private onExit(code: number | null, signal: NodeJS.Signals | null): void {
    // Reject all pending calls
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error(`Sidecar exited (code=${code}, signal=${signal})`))
      this.pending.delete(id)
    }

    this.handshakeResult = null
    this.proc = null

    if (this.disposed) return

    if (this.restartCount < RESTART_LIMIT) {
      this.restartCount++
      const delay = 500 * Math.pow(2, this.restartCount - 1)
      this.emit('restarting', { attempt: this.restartCount, delay })
      // Publish the scheduled restart through startPromise so a start() call
      // arriving during the delay waits for it instead of spawning again.
      this.startPromise = new Promise<HandshakeResult>((resolve, reject) => {
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null
          if (this.disposed) {
            this.startPromise = null
            reject(new Error('Sidecar disposed'))
            return
          }
          this.spawn()
            .then(() => {
              this.startPromise = null
              resolve(this.handshakeResult!)
            })
            .catch(err => {
              this.startPromise = null
              this.emit('crash', `Restart failed: ${err.message}`)
              reject(err)
            })
        }, delay)
      })
      // Avoid an unhandled rejection when the crash happens while idle.
      this.startPromise.catch(() => {})
    } else {
      this.emit('crash', 'Sidecar crashed and could not be restarted after 3 attempts')
    }
  }

  /**
   * Send a JSON-RPC request and await the matching response.
   */
  call<T = unknown>(method: string, params: unknown, opts?: { signal?: AbortSignal }): Promise<T> {
    if (opts?.signal?.aborted) {
      return Promise.reject(new Error('Aborted'))
    }

    const signal = opts?.signal
    return this.rawCall<T>(method, params, signal)
  }

  private rawCall<T = unknown>(method: string, params: unknown, signal?: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.proc || !this.proc.stdin) {
        reject(new Error('Sidecar is not running'))
        return
      }

      if (signal?.aborted) {
        reject(new Error('Aborted'))
        return
      }

      const id = this.nextId++
      const request: RpcRequest = {
        jsonrpc: '2.0',
        id,
        method: method as RpcRequest['method'],
        params
      }

      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Sidecar call "${method}" timed out after ${READ_TIMEOUT_MS}ms`))
      }, READ_TIMEOUT_MS)

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })

      const line = JSON.stringify(request) + '\n'
      this.proc.stdin.write(line, 'utf-8')

      // Support abort
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            this.pending.delete(id)
            reject(new Error('Aborted'))
          },
          { once: true }
        )
      }
    })
  }

  dispose(): void {
    this.disposed = true
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    this.startPromise = null
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Sidecar disposed'))
    }
    this.pending.clear()
    if (this.proc) {
      this.proc.kill('SIGTERM')
      this.proc = null
    }
    this.handshakeResult = null
  }

  getEngineVersion(): string | null {
    return this.handshakeResult?.engine_version ?? null
  }
}
