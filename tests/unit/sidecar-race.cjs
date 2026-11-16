/**
 * Race-condition regression tests for SidecarManager (real source, bundled
 * with esbuild; 'electron' and 'child_process' are stubbed so the test runs
 * anywhere, spawning the actual packaged onedir sidecar binary).
 *
 * Covers the startup race that used to spawn two sidecar processes (one from
 * main's ensureSidecar, one from the renderer's first handshake):
 *  1. concurrent start() calls spawn exactly one process
 *  2. start() during a scheduled restart waits for it instead of spawning
 *  3. dispose() cancels a scheduled restart (no zombie respawn)
 *
 * Run: npm run test:race  (requires a packaged app: npm run build:mac)
 */

const assert = require('assert')
const { spawn } = require('child_process')
const { join, dirname } = require('path')
const { mkdtempSync, rmSync } = require('fs')
const { tmpdir } = require('os')

const PROJECT_ROOT = join(__dirname, '..', '..')

// The packaged app must exist: build it first with `npm run build:mac`.
const RESOURCES_PATH = join(
  PROJECT_ROOT,
  'dist',
  'mac-arm64',
  'PyiTOL Studio.app',
  'Contents',
  'Resources'
)

async function main() {
  const esbuild = require(join(PROJECT_ROOT, 'node_modules', 'esbuild'))
  const workDir = mkdtempSync(join(tmpdir(), 'sidecar-race-'))

  await esbuild.build({
    entryPoints: [join(PROJECT_ROOT, 'src', 'main', 'sidecar.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: join(workDir, 'sidecar_bundle.cjs'),
    external: ['electron']
  })

  // Stub 'electron' and instrument 'child_process' before loading the bundle.
  const Module = require('module')
  const origLoad = Module._load
  let spawnCount = 0
  const spawned = []

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return { app: { isPackaged: true, getVersion: () => '0.3.0' } }
    }
    if (request === 'child_process') {
      const cp = origLoad.apply(this, ['child_process', parent, isMain])
      return {
        ...cp,
        spawn: (...args) => {
          spawnCount++
          const child = cp.spawn(...args)
          spawned.push(child)
          return child
        }
      }
    }
    return origLoad.apply(this, [request, parent, isMain])
  }

  process.resourcesPath = RESOURCES_PATH

  const { SidecarManager } = require(join(workDir, 'sidecar_bundle.cjs'))

  try {
    // ── 1. Concurrent start() calls must spawn exactly one process ──
    const m = new SidecarManager()
    const [r1, r2] = await Promise.all([m.start(), m.start()])
    assert(
      r1?.engine_version && r2?.engine_version,
      'concurrent start() both resolve with handshake'
    )
    assert.strictEqual(
      r1.engine_version,
      r2.engine_version,
      'both callers get the same engine result'
    )
    assert.strictEqual(
      spawnCount,
      1,
      `concurrent start() spawns exactly 1 process (got ${spawnCount})`
    )

    // ── 2. start() during a scheduled restart must not spawn early ──
    const before = spawnCount
    spawned[0].kill('SIGKILL')
    await new Promise(r => setTimeout(r, 50)) // let onExit schedule the restart
    const duringRestart = m.start()
    await new Promise(r => setTimeout(r, 200))
    assert.strictEqual(
      spawnCount,
      before,
      `no early spawn while a restart is scheduled (spawnCount=${spawnCount})`
    )
    const r3 = await duringRestart
    assert(r3?.engine_version, 'start() awaited the scheduled restart and got a handshake')
    assert.strictEqual(spawnCount, before + 1, 'restart spawned exactly one new process')
    assert(m.getEngineVersion() !== null, 'engine version available after restart')
    m.dispose()

    // ── 3. dispose() cancels a scheduled restart ──
    const m2 = new SidecarManager()
    await m2.start()
    const count2 = spawnCount
    spawned[spawned.length - 1].kill('SIGKILL')
    await new Promise(r => setTimeout(r, 30))
    m2.dispose() // before the restart timer fires
    await new Promise(r => setTimeout(r, 1500))
    assert.strictEqual(
      spawnCount,
      count2,
      'dispose cancels the scheduled restart (no zombie respawn)'
    )

    console.log('sidecar-race: ALL TESTS PASSED')
  } finally {
    rmSync(workDir, { recursive: true, force: true })
    for (const child of spawned) {
      try {
        child.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }
    process.exit(0)
  }
}

main().catch(err => {
  console.error('sidecar-race: FAILED —', err.message)
  process.exit(1)
})
