/// <reference types="vite/client" />

// The preload bridge exposes `window.pyitol` via contextBridge
import type { PreloadApi } from '@shared/types'

declare global {
  interface Window {
    pyitol: PreloadApi
  }
}
