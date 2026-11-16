/**
 * IPC handlers for project file operations.
 *
 * .pyitolproj format v1 — byte-level compatible with the PySide6 version.
 * JSON structure: { pyitolproj_version: 1, name, tree_path, units: [...] }
 */

import { ipcMain, dialog } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { store } from './store'
import type { PyitolProjectData, RecentProjectEntry } from '@shared/types'

const PROJECT_FILTER = [{ name: 'PyiTOL Project', extensions: ['pyitolproj'] }]

function emptyProject(): PyitolProjectData {
  return {
    pyitolproj_version: 1,
    name: 'Untitled Project',
    tree_path: '',
    units: []
  }
}

function loadProjectFile(path: string): PyitolProjectData {
  const raw = readFileSync(path, 'utf-8')
  const data = JSON.parse(raw) as PyitolProjectData
  if (!data || !Array.isArray(data.units)) {
    throw new Error('Invalid .pyitolproj file: missing units array')
  }
  return data
}

function saveProjectFile(path: string, data: PyitolProjectData): void {
  const json = JSON.stringify(data, null, 2)
  writeFileSync(path, json, 'utf-8')
}

function getExampleProjectPath(): string {
  // In production, samples are in extraResources
  if (app.isPackaged) {
    return join(process.resourcesPath, 'samples', 'example_project.pyitolproj')
  }
  // In dev, read from the old project's resources
  const devPath = join(__dirname, '..', '..', 'resources', 'samples', 'example_project.pyitolproj')
  return devPath
}

export function registerProjectHandlers(): void {
  ipcMain.handle('project:new', async (): Promise<PyitolProjectData> => {
    return emptyProject()
  })

  ipcMain.handle('project:open', async (): Promise<PyitolProjectData | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Open Project',
      filters: PROJECT_FILTER,
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    const path = result.filePaths[0]
    try {
      const data = loadProjectFile(path)
      // Remember the path for "save" (no separate "save-as" needed)
      store.set('project/currentPath', path)
      return data
    } catch (err) {
      throw new Error(`Failed to open project: ${(err as Error).message}`)
    }
  })

  ipcMain.handle(
    'project:save',
    async (_event, data: PyitolProjectData): Promise<string | null> => {
      const currentPath = store.get('project/currentPath', null) as string | null
      if (!currentPath) {
        // No path yet → fall through to save-as
        return null
      }
      try {
        saveProjectFile(currentPath, data)
        return currentPath
      } catch (err) {
        throw new Error(`Failed to save project: ${(err as Error).message}`)
      }
    }
  )

  ipcMain.handle(
    'project:save-as',
    async (_event, data: PyitolProjectData): Promise<string | null> => {
      const result = await dialog.showSaveDialog({
        title: 'Save Project As',
        defaultPath: `${data.name || 'Untitled'}.pyitolproj`,
        filters: PROJECT_FILTER
      })
      if (result.canceled || !result.filePath) {
        return null
      }
      let path = result.filePath
      if (!path.endsWith('.pyitolproj')) {
        path += '.pyitolproj'
      }
      try {
        saveProjectFile(path, data)
        store.set('project/currentPath', path)
        return path
      } catch (err) {
        throw new Error(`Failed to save project: ${(err as Error).message}`)
      }
    }
  )

  ipcMain.handle('project:load-example', async (): Promise<PyitolProjectData | null> => {
    const examplePath = getExampleProjectPath()
    if (!existsSync(examplePath)) {
      return null
    }
    try {
      const data = loadProjectFile(examplePath)
      // Mark as example — no current path (must save-as before editing)
      store.delete('project/currentPath')
      return data
    } catch (err) {
      console.error('[project] Failed to load example:', err)
      return null
    }
  })

  ipcMain.handle('project:recent', async (): Promise<RecentProjectEntry[]> => {
    const recent = store.get('project/recent', []) as RecentProjectEntry[]
    // Filter out files that no longer exist
    const valid = recent.filter(entry => existsSync(entry.path))
    if (valid.length !== recent.length) {
      store.set('project/recent', valid)
    }
    return valid
  })

  ipcMain.handle(
    'project:add-recent',
    async (_event, path: string, name: string, unitCount: number): Promise<void> => {
      const recent = store.get('project/recent', []) as RecentProjectEntry[]
      // Remove existing entry for this path
      const filtered = recent.filter(entry => entry.path !== path)
      // Add to front
      filtered.unshift({
        path,
        name,
        unitCount,
        lastOpened: Date.now()
      })
      // Keep last 10
      const trimmed = filtered.slice(0, 10)
      store.set('project/recent', trimmed)
    }
  )

  ipcMain.handle('project:clear-recent', async (): Promise<void> => {
    store.delete('project/recent')
  })

  // Renderer-side opens (drag & drop, recent list) must also register the path
  // so "save" (⌘S) works without re-asking — single source of truth in main.
  ipcMain.handle('project:set-current-path', async (_event, path: string | null): Promise<void> => {
    if (path) {
      store.set('project/currentPath', path)
    } else {
      store.delete('project/currentPath')
    }
  })

  ipcMain.handle('project:get-current-path', async (): Promise<string | null> => {
    return store.get('project/currentPath', null) as string | null
  })
}
