/**
 * Persistent settings store backed by electron-store.
 *
 * In development, electron-store is externalised; we use a thin JSON
 * wrapper on the app userData path as a fallback.
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

interface StoreData {
  [key: string]: unknown
}

class JsonStore {
  private filePath: string
  private data: StoreData = {}

  constructor() {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.filePath = join(dir, 'settings.json')
    this.load()
  }

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8')
        this.data = JSON.parse(raw) as StoreData
      }
    } catch {
      this.data = {}
    }
  }

  private save(): void {
    try {
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (err) {
      console.error('[store] Failed to save:', err)
    }
  }

  get<T>(key: string, fallback: T): T {
    const value = this.data[key]
    return value === undefined ? fallback : (value as T)
  }

  set<T>(key: string, value: T): void {
    this.data[key] = value
    this.save()
  }

  delete(key: string): void {
    delete this.data[key]
    this.save()
  }
}

export const store = new JsonStore()
