import { useEffect } from 'react'
import { useUIStore } from '../stores/ui'

/**
 * Global keyboard shortcuts that don't belong to specific inputs.
 */
export function useKeyboardShortcuts(): void {
  const setCommandPaletteOpen = useUIStore(s => s.setCommandPaletteOpen)
  const setWizardOpen = useUIStore(s => s.setWizardOpen)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      // ⌘K / Ctrl+K — command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
        return
      }

      // ⌥⌘W / Ctrl+Alt+W — wizard (⌘⇧W is "close all windows" on macOS)
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'w') {
        e.preventDefault()
        setWizardOpen(true)
        return
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setCommandPaletteOpen, setWizardOpen])
}
