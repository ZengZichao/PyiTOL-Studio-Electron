import { useCallback, useRef, type ReactNode } from 'react'

interface SplitterProps {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
  onResizeAbsolute?: (startSize: number, offset: number) => void
  startSize?: number
  children?: ReactNode
}

/**
 * A draggable splitter bar. Reports the drag delta (in px) to the parent.
 * Uses pointer events with setPointerCapture for reliable dragging.
 *
 * The splitter now also supports absolute resize mode: if `onResizeAbsolute`
 * and `startSize` are provided, it reports the total offset from drag start
 * rather than incremental deltas, avoiding stale closure issues.
 */
export function Splitter({
  direction,
  onResize,
  onResizeAbsolute,
  startSize
}: SplitterProps): JSX.Element {
  const startPos = useRef<number>(0)
  const baseSize = useRef<number>(0)
  const dragging = useRef(false)

  const isHorizontal = direction === 'horizontal'

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      dragging.current = true
      startPos.current = isHorizontal ? e.clientX : e.clientY
      baseSize.current = startSize ?? 0

      const target = e.currentTarget as HTMLElement
      try {
        target.setPointerCapture(e.pointerId)
      } catch {
        // pointer capture may fail in some contexts
      }

      const onMove = (ev: PointerEvent): void => {
        if (!dragging.current) return
        const current = isHorizontal ? ev.clientX : ev.clientY
        const delta = current - startPos.current

        if (onResizeAbsolute && startSize !== undefined) {
          // Absolute mode: report startSize + total offset
          onResizeAbsolute(baseSize.current, delta)
        } else {
          // Delta mode: report the increment since last event
          startPos.current = current
          onResize(delta)
        }
      }

      const onUp = (): void => {
        dragging.current = false
        try {
          target.releasePointerCapture(e.pointerId)
        } catch {
          // already released
        }
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
      document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [direction, onResize, onResizeAbsolute, startSize, isHorizontal]
  )

  return (
    <div
      role="separator"
      aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
      tabIndex={0}
      aria-valuenow={Math.round(startSize ?? 0)}
      className="group relative flex-shrink-0 transition-colors hover:bg-accent/20 no-drag"
      style={{
        [isHorizontal ? 'width' : 'height']: '5px',
        cursor: isHorizontal ? 'col-resize' : 'row-resize',
        backgroundColor: 'var(--color-hairline)'
      }}
      onPointerDown={onPointerDown}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          onResize(-8)
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          onResize(8)
        }
      }}
    >
      {/* Extended hit area */}
      <div
        className="absolute inset-0"
        style={{
          left: isHorizontal ? '-3px' : '0',
          right: isHorizontal ? '-3px' : '0',
          top: isHorizontal ? '0' : '-3px',
          bottom: isHorizontal ? '0' : '-3px',
          backgroundColor: 'transparent',
          transition: 'background-color 0.15s ease'
        }}
      />
    </div>
  )
}
