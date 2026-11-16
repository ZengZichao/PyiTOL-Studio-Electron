import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Check, X, RefreshCw } from 'lucide-react'
import type { UpdateStatus } from '@shared/types'

export function UpdateNotification(): JSX.Element | null {
  const { t } = useTranslation()
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const prevStatusRef = useRef<string | null>(null)

  useEffect(() => {
    return window.pyitol.update.onStatus(s => {
      setStatus(s)
      // If the status transitions from downloading to downloaded,
      // reset dismissed so the "install" prompt appears even if the user
      // dismissed the "available" notification.
      if (prevStatusRef.current === 'downloading' && s.status === 'downloaded') {
        setDismissed(false)
      }
      prevStatusRef.current = s.status
      if (s.status === 'not-available') {
        setTimeout(() => setDismissed(true), 3000)
      }
    })
  }, [])

  if (!status || dismissed) return null

  const handleInstall = (): void => {
    void window.pyitol.update.install()
  }

  const handleDismiss = (): void => {
    setDismissed(true)
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed z-[55]"
        style={{ bottom: '16px', right: '16px' }}
        role="status"
        aria-live="polite"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.2 }}
      >
        <div
          className="card"
          style={{ padding: '12px 16px', minWidth: 280, boxShadow: 'var(--shadow-2)' }}
        >
          {status.status === 'checking' && (
            <div className="flex items-center" style={{ gap: '8px' }}>
              <RefreshCw size={14} className="animate-spin text-accent" />
              <span style={{ fontSize: 'var(--text-caption)' }}>{t('update.checking')}</span>
            </div>
          )}

          {status.status === 'available' && (
            <div className="flex items-center justify-between" style={{ gap: '8px' }}>
              <div className="flex items-center" style={{ gap: '8px' }}>
                <Download size={14} className="text-accent" />
                <span style={{ fontSize: 'var(--text-caption)' }}>
                  {t('update.available', { version: status.version })}
                </span>
                <span
                  style={{ fontSize: 'var(--text-fine-print)', color: 'var(--color-ink-subtle)' }}
                >
                  {t('update.downloading_auto', { defaultValue: 'Downloading…' })}
                </span>
              </div>
              <button
                className="no-drag"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  color: 'var(--color-ink-subtle)'
                }}
                onClick={handleDismiss}
                aria-label={t('dialog.close')}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {status.status === 'downloading' && (
            <div className="flex flex-col" style={{ gap: '8px' }}>
              <div className="flex items-center" style={{ gap: '8px' }}>
                <Download size={14} className="animate-pulse text-accent" />
                <span style={{ fontSize: 'var(--text-caption)' }}>
                  {t('update.downloading', { percent: status.percent ?? 0 })}
                </span>
              </div>
              <div
                className="h-1 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--color-hairline)' }}
              >
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${status.percent ?? 0}%`,
                    backgroundColor: 'var(--color-accent)'
                  }}
                />
              </div>
            </div>
          )}

          {status.status === 'downloaded' && (
            <div className="flex items-center justify-between" style={{ gap: '8px' }}>
              <div className="flex items-center" style={{ gap: '8px' }}>
                <Check size={14} className="text-accent" />
                <span style={{ fontSize: 'var(--text-caption)' }}>{t('update.downloaded')}</span>
              </div>
              <div className="flex items-center" style={{ gap: '8px' }}>
                <button
                  className="btn-pearl no-drag"
                  style={{ minHeight: 28, padding: '4px 10px', fontSize: 'var(--text-fine-print)' }}
                  onClick={handleDismiss}
                >
                  {t('update.later')}
                </button>
                <button
                  className="btn-primary no-drag"
                  style={{ minHeight: 28, padding: '4px 10px', fontSize: 'var(--text-fine-print)' }}
                  onClick={handleInstall}
                >
                  {t('update.install')}
                </button>
              </div>
            </div>
          )}

          {status.status === 'not-available' && (
            <div className="flex items-center" style={{ gap: '8px' }}>
              <Check size={14} className="text-accent" />
              <span style={{ fontSize: 'var(--text-caption)' }}>{t('update.not_available')}</span>
            </div>
          )}

          {status.status === 'error' && (
            <div className="flex items-center justify-between" style={{ gap: '8px' }}>
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-danger)' }}>
                {t('update.error', { error: status.error ?? '' })}
              </span>
              <button
                className="no-drag"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  color: 'var(--color-ink-subtle)'
                }}
                onClick={handleDismiss}
                aria-label={t('dialog.close')}
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
