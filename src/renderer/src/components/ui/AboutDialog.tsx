import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useDialog } from '../../hooks/useDialog'

interface AboutDialogProps {
  onClose: () => void
}

export function AboutDialog({ onClose }: AboutDialogProps): JSX.Element {
  const { t } = useTranslation()
  const containerRef = useDialog(true, onClose)

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-title"
          tabIndex={-1}
          className="card relative flex flex-col items-center text-center"
          style={{ width: 360, padding: 32 }}
          onClick={e => e.stopPropagation()}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            className="no-drag absolute top-2 right-2 text-ink-subtle hover:text-ink"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            onClick={onClose}
            aria-label={t('dialog.close')}
          >
            <X size={16} />
          </button>

          {/* Logo */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 64 64"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-ink mb-sm"
          >
            <line x1="8" y1="32" x2="20" y2="32" />
            <line x1="20" y1="18" x2="20" y2="46" />
            <line x1="20" y1="18" x2="36" y2="18" />
            <line x1="20" y1="46" x2="36" y2="46" />
            <line x1="36" y1="10" x2="36" y2="26" />
            <line x1="36" y1="10" x2="52" y2="10" />
            <line x1="36" y1="26" x2="52" y2="26" />
            <line x1="36" y1="38" x2="36" y2="54" />
            <line x1="36" y1="38" x2="52" y2="38" />
            <line x1="36" y1="54" x2="52" y2="54" />
          </svg>

          <h2 id="about-title" style={{ fontSize: 'var(--text-tagline)', fontWeight: 600 }}>
            PyiTOL Studio
          </h2>
          <p
            className="mt-xxs"
            style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-subtle)' }}
          >
            Version 0.3.0
          </p>
          <p
            className="mt-sm"
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-muted)',
              maxWidth: 280
            }}
          >
            {t('app.subtitle')}
          </p>
          <p
            className="mt-sm"
            style={{ fontSize: 'var(--text-fine-print)', color: 'var(--color-ink-subtle)' }}
          >
            MIT License
          </p>
          <button className="btn-primary mt-lg" onClick={onClose}>
            {t('dialog.ok')}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
