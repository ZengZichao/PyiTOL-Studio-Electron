/**
 * Preload script — the ONLY bridge between the sandboxed renderer and the
 * privileged main process.
 *
 * Security:
 *  - contextIsolation: true (renderer cannot touch Node APIs)
 *  - nodeIntegration: false
 *  - sandbox: true
 *  - No `require` / `import` of electron in renderer
 *  - Exposes a typed `window.pyitol` API via contextBridge
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  PreloadApi,
  MenuCommand,
  RpcMethod,
  UploadParams,
  UploadResult,
  UpdateStatus
} from '@shared/types'

const ipcCall = <T>(channel: string, ...args: unknown[]): Promise<T> => {
  return ipcRenderer.invoke(channel, ...args)
}

const api: PreloadApi = {
  sidecar: {
    // NOTE: no opts/signal here — AbortSignal is not structured-cloneable and
    // would make ipcRenderer.invoke throw before reaching the main process.
    // Stale-result discarding is done in the renderer instead.
    call<T = unknown>(method: RpcMethod, params: unknown): Promise<T> {
      return ipcCall<T>('sidecar:call', method, params)
    },
    onProgress(cb: (msg: string, percent?: number) => void): () => void {
      const handler = (_e: unknown, msg: string, percent?: number): void => cb(msg, percent)
      ipcRenderer.on('sidecar:progress', handler)
      return () => ipcRenderer.removeListener('sidecar:progress', handler)
    },
    onCrash(cb: (msg: string) => void): () => void {
      const handler = (_e: unknown, msg: string): void => cb(msg)
      ipcRenderer.on('sidecar:crash', handler)
      return () => ipcRenderer.removeListener('sidecar:crash', handler)
    },
    engineVersion(): string | null {
      return ipcRenderer.sendSync('sidecar:engine-version') as string | null
    }
  },

  project: {
    newProject(): Promise<import('@shared/types').PyitolProjectData> {
      return ipcCall('project:new')
    },
    openProject(): Promise<import('@shared/types').PyitolProjectData | null> {
      return ipcCall('project:open')
    },
    saveProject(data: import('@shared/types').PyitolProjectData): Promise<string | null> {
      return ipcCall('project:save', data)
    },
    saveProjectAs(data: import('@shared/types').PyitolProjectData): Promise<string | null> {
      return ipcCall('project:save-as', data)
    },
    loadExampleProject(): Promise<import('@shared/types').PyitolProjectData | null> {
      return ipcCall('project:load-example')
    },
    readRecentProjects(): Promise<import('@shared/types').RecentProjectEntry[]> {
      return ipcCall('project:recent')
    },
    addRecentProject(path: string, name: string, unitCount: number): Promise<void> {
      return ipcCall('project:add-recent', path, name, unitCount)
    },
    clearRecentProjects(): Promise<void> {
      return ipcCall('project:clear-recent')
    },
    setCurrentPath(path: string | null): Promise<void> {
      return ipcCall('project:set-current-path', path)
    },
    getCurrentPath(): Promise<string | null> {
      return ipcCall('project:get-current-path')
    },
    reportSaveFinished(saved: boolean): void {
      ipcRenderer.send('close-save-finished', saved)
    }
  },

  files: {
    pickTreeFile(): Promise<string | null> {
      return ipcCall('files:pick-tree')
    },
    pickTemplateFile(): Promise<string | null> {
      return ipcCall('files:pick-template')
    },
    pickDataFile(): Promise<string | null> {
      return ipcCall('files:pick-data')
    },
    pickDirectory(): Promise<string | null> {
      return ipcCall('files:pick-directory')
    },
    readFile(path: string): Promise<string> {
      return ipcCall('files:read', path)
    },
    writeFile(path: string, content: string): Promise<void> {
      return ipcCall('files:write', path, content)
    },
    deleteFile(path: string): Promise<void> {
      return ipcCall('files:delete', path)
    },
    exportTemplate(defaultName: string): Promise<string | null> {
      return ipcCall('files:export-template', defaultName)
    },
    detectFileType(path: string): Promise<'tree' | 'template' | 'unknown'> {
      return ipcCall('files:detect-type', path)
    },
    getTempDir(): string {
      return ipcRenderer.sendSync('files:get-temp-dir') as string
    },
    joinPath(dir: string, file: string): string {
      return ipcRenderer.sendSync('files:join-path', dir, file) as string
    },
    getPathForFile(file: File): string | null {
      try {
        return webUtils.getPathForFile(file) || null
      } catch {
        return null
      }
    }
  },

  clipboard: {
    readText(): Promise<string> {
      return ipcCall<string>('clipboard:read')
    },
    writeText(text: string): void {
      ipcRenderer.send('clipboard:write', text)
    }
  },

  settings: {
    get<T>(key: string, fallback: T): T {
      return ipcRenderer.sendSync('settings:get', key, fallback) as T
    },
    set<T>(key: string, value: T): void {
      ipcRenderer.send('settings:set', key, value)
    },
    delete(key: string): void {
      ipcRenderer.send('settings:delete', key)
    }
  },

  platform: {
    onThemeChange(cb: (theme: 'light' | 'dark') => void): () => void {
      const handler = (_e: unknown, theme: 'light' | 'dark'): void => cb(theme)
      ipcRenderer.on('platform:theme-changed', handler)
      return () => ipcRenderer.removeListener('platform:theme-changed', handler)
    },
    shouldUseDarkColors(): boolean {
      return ipcRenderer.sendSync('platform:should-use-dark-colors') as boolean
    },
    openExternal(url: string): Promise<void> {
      return ipcCall('platform:open-external', url)
    },
    showInFolder(path: string): void {
      ipcRenderer.send('platform:show-in-folder', path)
    }
  },

  menu: {
    onCommand(cb: (command: MenuCommand) => void): () => void {
      const handler = (_e: unknown, command: MenuCommand): void => cb(command)
      ipcRenderer.on('menu:command', handler)
      return () => ipcRenderer.removeListener('menu:command', handler)
    }
  },

  upload: {
    run(
      params: UploadParams,
      onProgress: (msg: string, percent?: number) => void,
      signal?: AbortSignal
    ): Promise<UploadResult> {
      return new Promise((resolve, reject) => {
        const reqId = Math.random().toString(36).slice(2)

        const progressHandler = (_e: unknown, id: string, msg: string, percent?: number): void => {
          if (id === reqId) onProgress(msg, percent)
        }
        ipcRenderer.on('upload:progress', progressHandler)

        ipcCall<UploadResult>('upload:run', reqId, params)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            ipcRenderer.removeListener('upload:progress', progressHandler)
          })

        if (signal) {
          signal.addEventListener(
            'abort',
            () => {
              ipcRenderer.send('upload:cancel', reqId)
              reject(new Error('Aborted'))
            },
            { once: true }
          )
        }
      })
    },
    cancel(): void {
      ipcRenderer.send('upload:cancel')
    }
  },

  dirty: {
    set(dirty: boolean): void {
      ipcRenderer.send('set-dirty', dirty)
    },
    check(): boolean {
      return ipcRenderer.sendSync('check-dirty-sync') as boolean
    }
  },

  update: {
    check(): Promise<void> {
      return ipcCall('update:check')
    },
    install(): Promise<void> {
      return ipcCall('update:install')
    },
    onStatus(cb: (status: UpdateStatus) => void): () => void {
      const handler = (_e: unknown, status: UpdateStatus): void => cb(status)
      ipcRenderer.on('update:status', handler)
      return () => ipcRenderer.removeListener('update:status', handler)
    }
  }
}

contextBridge.exposeInMainWorld('pyitol', api)
