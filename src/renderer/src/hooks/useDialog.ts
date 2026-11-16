import { useEffect, useRef, useCallback } from 'react'

/**
 * useDialog — shared dialog behavior:
 *  - Focus trap (Tab cycles within the dialog)
 *  - Esc to close
 *  - Initial focus on a specified element
 *  - Focus restoration on unmount
 *  - Body scroll lock
 */
export function useDialog(
  open: boolean,
  onClose: () => void,
  options?: {
    initialFocusRef?: React.RefObject<HTMLElement>
  }
): React.RefObject<HTMLDivElement> {
  const containerRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      if (e.key === 'Tab') {
        const container = containerRef.current
        if (!container) return

        const focusable = container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first || !container.contains(document.activeElement)) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last || !container.contains(document.activeElement)) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement

    // Lock scroll
    document.body.style.overflow = 'hidden'

    // Focus initial element or container
    setTimeout(() => {
      const target = options?.initialFocusRef?.current ?? containerRef.current
      target?.focus()
    }, 50)

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.body.style.overflow = ''
      // Restore focus
      previouslyFocused.current?.focus()
    }
  }, [open, handleKeyDown, options?.initialFocusRef])

  return containerRef
}
