import type { ThemeMode } from '@shared/types'

/**
 * Apply the theme class to <html> based on the mode and the system preference.
 * (System-theme change listening lives in App.tsx via the native
 * platform:theme-changed IPC channel; no separate watcher is needed here.)
 */
export function applyThemeClass(mode: ThemeMode): void {
  const root = document.documentElement
  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  } else {
    root.classList.toggle('dark', mode === 'dark')
  }
}
