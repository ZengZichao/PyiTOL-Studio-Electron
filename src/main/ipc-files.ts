/**
 * IPC handlers for file operations: tree file picker, template file picker,
 * data file picker, read/write, export, type detection.
 *
 * All file access is user-initiated via native dialogs — the renderer
 * never touches the filesystem directly.
 */

import { ipcMain, dialog } from 'electron'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { extname, join, isAbsolute, normalize } from 'path'
import { tmpdir } from 'os'

const TREE_EXTENSIONS = ['nwk', 'newick', 'tre', 'tree', 'txt']
const TABLE_EXTENSIONS = ['csv', 'tsv', 'txt']

/**
 * Refuse paths with .. traversal segments or relative paths.
 * (Restores the path-validation semantics the PySide6 version had.)
 */
function assertSafePath(path: string): void {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('Invalid path')
  }
  if (!isAbsolute(path)) {
    throw new Error(`Refused relative path: ${path}`)
  }
  const normalized = normalize(path)
  if (normalized.split(/[\\/]/).includes('..')) {
    throw new Error(`Refused path with .. traversal: ${path}`)
  }
}

function isProbablyNewick(content: string): boolean {
  const trimmed = content.trim()
  // Newick trees end with ; and contain parentheses
  return trimmed.endsWith(';') && trimmed.includes('(') && trimmed.includes(')')
}

function isProbablyTemplate(content: string): boolean {
  const upper = content.toUpperCase()
  // iTOL templates always start with a header like "DATASET_*"
  return (
    upper.startsWith('DATASET_') ||
    upper.includes('\nDATASET_') ||
    (upper.includes('SEPARATOR') && upper.includes('DATASET_LABEL'))
  )
}

export function registerFileHandlers(): void {
  ipcMain.handle('files:pick-tree', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Select Tree File',
      filters: [
        { name: 'Tree Files', extensions: TREE_EXTENSIONS },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('files:pick-template', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Select iTOL Template File',
      filters: [
        { name: 'iTOL Template', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('files:pick-data', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Import Data File',
      filters: [
        { name: 'Table Files', extensions: TABLE_EXTENSIONS },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('files:read', async (_event, path: string): Promise<string> => {
    assertSafePath(path)
    if (!existsSync(path)) {
      throw new Error(`File not found: ${path}`)
    }
    return readFileSync(path, 'utf-8')
  })

  ipcMain.handle('files:write', async (_event, path: string, content: string): Promise<void> => {
    assertSafePath(path)
    writeFileSync(path, content, 'utf-8')
  })

  ipcMain.handle('files:delete', async (_event, path: string): Promise<void> => {
    assertSafePath(path)
    if (existsSync(path)) {
      unlinkSync(path)
    }
  })

  ipcMain.handle(
    'files:export-template',
    async (_event, defaultName: string): Promise<string | null> => {
      const result = await dialog.showSaveDialog({
        title: 'Export Template',
        defaultPath: defaultName.endsWith('.txt') ? defaultName : `${defaultName}.txt`,
        filters: [{ name: 'iTOL Template', extensions: ['txt'] }]
      })
      if (result.canceled || !result.filePath) return null
      return result.filePath
    }
  )

  ipcMain.handle('files:pick-directory', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Select Directory',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.on('files:get-temp-dir', event => {
    event.returnValue = tmpdir()
  })

  ipcMain.on('files:join-path', (event, dir: string, file: string) => {
    event.returnValue = join(dir, file)
  })

  ipcMain.handle(
    'files:detect-type',
    async (_event, path: string): Promise<'tree' | 'template' | 'unknown'> => {
      if (!existsSync(path)) return 'unknown'

      // Quick check by extension
      const ext = extname(path).toLowerCase().replace('.', '')
      if (['nwk', 'newick', 'tre', 'tree'].includes(ext)) {
        return 'tree'
      }

      // Content sniffing for .txt files
      try {
        const content = readFileSync(path, 'utf-8').slice(0, 2048)
        if (isProbablyTemplate(content)) return 'template'
        if (isProbablyNewick(content)) return 'tree'
      } catch {
        // ignore read errors
      }
      return 'unknown'
    }
  )
}
