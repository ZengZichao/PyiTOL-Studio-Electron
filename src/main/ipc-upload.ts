/**
 * IPC handlers for upload — long-running, with progress and cancellation.
 */

import { ipcMain, BrowserWindow } from 'electron'
import type { SidecarManager } from './sidecar'
import type { UploadParams, UploadResult } from '@shared/types'

export function registerUploadHandlers(sidecar: SidecarManager): void {
  ipcMain.handle(
    'upload:run',
    async (event, reqId: string, params: UploadParams): Promise<UploadResult> => {
      const win = BrowserWindow.fromWebContents(event.sender)

      // Forward progress to the renderer
      const progressHandler = (msg: string, percent?: number): void => {
        win?.webContents.send('upload:progress', reqId, msg, percent)
      }
      sidecar.on('progress', progressHandler)

      try {
        const result = await sidecar.call<UploadResult>('upload', params)
        return result
      } finally {
        sidecar.off('progress', progressHandler)
      }
    }
  )

  // Cancellation — we can't truly abort the Python process mid-upload,
  // but we signal the sidecar to stop retrying
  ipcMain.on('upload:cancel', (_event, _reqId?: string) => {
    // The sidecar upload is a single call; true cancellation would need
    // engine-level support. For now, we just let it finish.
    // A future improvement: pass a cancel flag via the progress channel.
  })
}
