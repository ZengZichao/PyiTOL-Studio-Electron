/**
 * Auto-updater manager using electron-updater.
 * Only active in production (packaged) builds that ship an app-update.yml
 * (i.e. a real `publish` config exists in electron-builder.yml). Local builds
 * without a feed stay silent instead of surfacing bogus network errors.
 * Sends update status events to the renderer.
 */

import { BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'

export class UpdaterManager {
  private win: BrowserWindow | null
  private enabled = false

  constructor(win: BrowserWindow | null) {
    this.win = win
  }

  async init(): Promise<void> {
    // electron-builder only writes app-update.yml into Resources when a
    // `publish` section is configured. Without it there is no feed and
    // checkForUpdates() would fail on every launch.
    this.enabled = existsSync(join(process.resourcesPath, 'app-update.yml'))

    // IPC handlers are registered unconditionally so renderer calls
    // (About dialog, manual check) resolve instead of throwing.
    ipcMain.handle('update:check', async () => {
      if (!this.enabled) return
      try {
        await autoUpdater.checkForUpdates()
      } catch {
        // ignore — error event will fire
      }
    })

    ipcMain.handle('update:install', () => {
      if (!this.enabled) return
      autoUpdater.quitAndInstall()
    })

    if (!this.enabled) {
      console.log('[updater] No app-update.yml in resources — auto-update disabled')
      return
    }

    // Configure auto-updater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    // Listen for events and forward to renderer
    autoUpdater.on('checking-for-update', () => {
      this.send('update:status', { status: 'checking' })
    })

    autoUpdater.on('update-available', info => {
      this.send('update:status', { status: 'available', version: info.version })
    })

    autoUpdater.on('update-not-available', () => {
      this.send('update:status', { status: 'not-available' })
    })

    autoUpdater.on('download-progress', progress => {
      this.send('update:status', {
        status: 'downloading',
        percent: Math.round(progress.percent)
      })
    })

    autoUpdater.on('update-downloaded', () => {
      this.send('update:status', { status: 'downloaded' })
    })

    autoUpdater.on('error', err => {
      this.send('update:status', { status: 'error', error: err.message })
    })

    // Check for updates on startup (after a short delay)
    setTimeout(() => {
      void autoUpdater.checkForUpdates().catch(() => {
        // Silently fail — user can check manually
      })
    }, 5000)
  }

  private send(channel: string, data: unknown): void {
    this.win?.webContents.send(channel, data)
  }
}
