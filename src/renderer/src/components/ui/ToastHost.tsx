import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useToastStore } from '../../stores/ui'

/**
 * Global toast host — renders transient feedback (save/export/errors)
 * in the bottom-right corner. Consumes the app.status_* i18n strings.
 * Toasts auto-dismiss after a few seconds; toasts with an action stay longer.
 */
export function ToastHost(): JSX.Element {
  const toasts = useToastStore(s => s.toasts)
  const dismissToast = useToastStore(s => s.dismissToast)

  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map(toast =>
      setTimeout(() => dismissToast(toast.id), toast.actionLabel ? 10000 : 4000)
    )
    return () => timers.forEach(clearTimeout)
    // Re-arm timers whenever the toast list changes
  }, [toasts, dismissToast])

  return (
    <div
      className="fixed z-[80] flex flex-col"
      style={{ bottom: 16, right: 16, gap: 8, maxWidth: 360 }}
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map(toast => {
          const Icon =
            toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertCircle : Info
          const color =
            toast.kind === 'success'
              ? 'var(--color-success)'
              : toast.kind === 'error'
                ? 'var(--color-danger)'
                : 'var(--color-accent)'
          return (
            <motion.div
              key={toast.id}
              className="card flex items-center"
              style={{ padding: '10px 12px', gap: 8, boxShadow: 'var(--shadow-2)' }}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.15 }}
            >
              <Icon size={14} style={{ color, flexShrink: 0 }} />
              <span className="flex-1" style={{ fontSize: 'var(--text-caption)' }}>
                {toast.message}
              </span>
              {toast.actionLabel && toast.onAction && (
                <button
                  className="text-link no-drag"
                  style={{
                    fontSize: 'var(--text-caption)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    flexShrink: 0
                  }}
                  onClick={() => {
                    toast.onAction?.()
                    dismissToast(toast.id)
                  }}
                >
                  {toast.actionLabel}
                </button>
              )}
              <button
                className="no-drag"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  color: 'var(--color-ink-subtle)',
                  flexShrink: 0
                }}
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss"
              >
                <X size={12} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
