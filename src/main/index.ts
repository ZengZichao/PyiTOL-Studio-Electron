/**
 * Electron main process entry point.
 *
 * Security baseline (iron law #3):
 *  - contextIsolation: true
 *  - nodeIntegration: false
 *  - sandbox: true
 *  - CSP locked down
 *  - No remote module
 */

import { app, BrowserWindow, ipcMain, Menu, nativeTheme, shell, clipboard, dialog } from 'electron'
import { join } from 'path'
import { store } from './store'
import { SidecarManager } from './sidecar'
import { registerProjectHandlers } from './ipc-project'
import { registerFileHandlers } from './ipc-files'
import { registerUploadHandlers } from './ipc-upload'
import { buildMenu } from './menu'
import { UpdaterManager } from './updater'
import type { MenuCommand, ThemeMode } from '@shared/types'

let mainWindow: BrowserWindow | null = null
const sidecar = new SidecarManager()
let updater: UpdaterManager | null = null
/** Set when the close-intercept chose "Save" — the window only closes after the renderer reports the save outcome. */
let awaitingCloseSave = false
/** Unconditional close (user discarded or save completed). */
let forceClose = false

function closeDialogStrings(): {
  buttons: string[]
  title: string
  message: string
  detail: string
} {
  const zh = (store.get('ui/language', 'en') as string) === 'zh'
  return zh
    ? {
        buttons: ['保存', '不保存', '取消'],
        title: '有未保存的修改',
        message: '当前工程有未保存的修改。',
        detail: '关闭前要保存这些修改吗？'
      }
    : {
        buttons: ['Save', 'Discard', 'Cancel'],
        title: 'Unsaved Changes',
        message: 'You have unsaved changes.',
        detail: 'Do you want to save your changes before closing?'
      }
}

function getPreloadPath(): string {
  return join(__dirname, '../preload/index.cjs')
}

function getRendererPath(): string {
  // Dev: load from Vite dev server
  // Prod: load bundled HTML
  if (process.env['ELECTRON_RENDERER_URL']) {
    return process.env['ELECTRON_RENDERER_URL']
  }
  return join(__dirname, '../renderer/index.html')
}

function createWindow(): void {
  // A recreated window (macOS re-activate) must not inherit the forced-close state
  forceClose = false
  awaitingCloseSave = false
  const savedTheme = store.get('ui/theme', 'system') as ThemeMode
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 15 },
    // Match the initial background to the saved theme to avoid a flash of the wrong colour
    backgroundColor:
      savedTheme === 'dark'
        ? '#1d1d1f'
        : savedTheme === 'light'
          ? '#ffffff'
          : nativeTheme.shouldUseDarkColors
            ? '#1d1d1f'
            : '#ffffff',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    }
  })

  // CSP — locked down: only allow resources from self
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          process.env['ELECTRON_RENDERER_URL']
            ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'"
        ]
      }
    })
  })

  // Open external links in the system browser, never in-app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Intercept close to warn about unsaved changes.
  // "Save" flow: we ask the renderer to save and ONLY close when it reports the
  // outcome via 'close-save-finished' — no timer-based force close (that raced
  // the native save dialog and destroyed the window mid-save).
  mainWindow.on('close', e => {
    if (forceClose) return
    const isDirty = store.get('app/dirty', false) as boolean
    if (isDirty) {
      e.preventDefault()
      const strs = closeDialogStrings()
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'warning',
        buttons: strs.buttons,
        defaultId: 0,
        cancelId: 2,
        title: strs.title,
        message: strs.message,
        detail: strs.detail
      })
      if (choice === 0) {
        awaitingCloseSave = true
        mainWindow?.webContents.send('menu:command', 'save-project')
      } else if (choice === 1) {
        forceClose = true
        mainWindow?.close()
      }
      // choice === 2: cancel, do nothing (e.preventDefault already called)
    }
  })

  // Renderer reports the outcome of a save triggered by the close dialog.
  // saved === true  → save (or save-as) succeeded → close now.
  // saved === false → user cancelled the save dialog → stay open.
  ipcMain.on('close-save-finished', (_event, saved: boolean) => {
    if (!awaitingCloseSave) return
    awaitingCloseSave = false
    if (saved) {
      forceClose = true
      mainWindow?.close()
    }
  })

  // Synchronous dirty check via IPC
  ipcMain.on('check-dirty-sync', event => {
    event.returnValue = store.get('app/dirty', false) as boolean
  })

  // Allow renderer to set dirty flag
  ipcMain.on('set-dirty', (_event, dirty: boolean) => {
    store.set('app/dirty', dirty)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const rendererPath = getRendererPath()
  if (rendererPath.startsWith('http')) {
    mainWindow.loadURL(rendererPath)
  } else {
    mainWindow.loadFile(rendererPath)
  }
}

// ─── Sidecar lifecycle ────────────────────────────────────────────────

async function ensureSidecar(): Promise<void> {
  try {
    await sidecar.start()
  } catch (err) {
    console.error('[main] Sidecar startup failed:', err)
  }
}

// Forward sidecar events to the renderer
sidecar.on('progress', (msg: string, percent?: number) => {
  mainWindow?.webContents.send('sidecar:progress', msg, percent)
})
sidecar.on('crash', (msg: string) => {
  mainWindow?.webContents.send('sidecar:crash', msg)
})

// ─── IPC: sidecar calls ───────────────────────────────────────────────

ipcMain.handle('sidecar:call', async (_event, method: string, params: unknown) => {
  await ensureSidecar()
  return sidecar.call(method, params)
})

ipcMain.on('sidecar:engine-version', _event => {
  // sync reply
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(_event as any).returnValue = sidecar.getEngineVersion()
})

// ─── IPC: settings ────────────────────────────────────────────────────

ipcMain.on('settings:get', (event, key: string, fallback: unknown) => {
  event.returnValue = store.get(key, fallback)
})

ipcMain.on('settings:set', (_event, key: string, value: unknown) => {
  store.set(key, value)
})

ipcMain.on('settings:delete', (_event, key: string) => {
  store.delete(key)
})

// ─── IPC: platform ────────────────────────────────────────────────────

ipcMain.handle('platform:open-external', async (_event, url: string) => {
  if (url.startsWith('https://')) {
    await shell.openExternal(url)
  }
})

ipcMain.on('platform:show-in-folder', (_event, path: string) => {
  shell.showItemInFolder(path)
})

ipcMain.on('platform:should-use-dark-colors', event => {
  event.returnValue = nativeTheme.shouldUseDarkColors
})

// Forward native theme changes to renderer
nativeTheme.on('updated', () => {
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  mainWindow?.webContents.send('platform:theme-changed', theme)
})

// ─── IPC: clipboard ──────────────────────────────────────────────────────
ipcMain.handle('clipboard:read', async () => {
  return clipboard.readText()
})

ipcMain.on('clipboard:write', (_event, text: string) => {
  clipboard.writeText(text)
})

// ─── Menu command forwarding ──────────────────────────────────────────

export function sendMenuCommand(command: MenuCommand): void {
  mainWindow?.webContents.send('menu:command', command)
}

// ─── Theme management ─────────────────────────────────────────────────

export function applyTheme(mode: ThemeMode): void {
  if (mode === 'system') {
    nativeTheme.themeSource = 'system'
  } else {
    nativeTheme.themeSource = mode
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Register IPC handlers
  registerProjectHandlers()
  registerFileHandlers()
  registerUploadHandlers(sidecar)

  // Apply saved theme
  const savedTheme = store.get('ui/theme', 'system') as ThemeMode
  applyTheme(savedTheme)

  // Build menu
  Menu.setApplicationMenu(buildMenu())

  createWindow()

  // Start sidecar (non-blocking — renderer will retry on first call)
  await ensureSidecar()

  // Initialize auto-updater (production only)
  if (app.isPackaged) {
    updater = new UpdaterManager(mainWindow)
    await updater.init()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  sidecar.dispose()
})
