import { useEffect, useState } from 'react'
import './i18n'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore, useToastStore } from './stores/ui'
import { useProjectStore } from './stores/project'
import { WelcomePage } from './components/welcome/WelcomePage'
import { Workbench } from './components/workbench/Workbench'
import { CommandPalette } from './components/command-palette/CommandPalette'
import { WizardDialog } from './components/wizard/WizardDialog'
import { UploadDialog } from './components/workbench/UploadDialog'
import { UpdateNotification } from './components/ui/UpdateNotification'
import { AboutDialog } from './components/ui/AboutDialog'
import { ToastHost } from './components/ui/ToastHost'
import { applyThemeClass } from './lib/theme'
import { useMenuCommands } from './hooks/useMenuCommands'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import type { EngineStatus } from '@shared/types'

export default function App(): JSX.Element {
  const { t, i18n } = useTranslation()
  const theme = useUIStore(s => s.theme)
  const language = useUIStore(s => s.language)
  const setLanguage = useUIStore(s => s.setLanguage)
  const view = useUIStore(s => s.view)
  const commandPaletteOpen = useUIStore(s => s.commandPaletteOpen)
  const wizardOpen = useUIStore(s => s.wizardOpen)
  const uploadDialogOpen = useUIStore(s => s.uploadDialogOpen)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('connecting')
  const [dragOverlay, setDragOverlay] = useState(false)

  // Apply theme class to <html>
  useEffect(() => {
    applyThemeClass(theme)
  }, [theme])

  // Listen for native theme changes (system mode)
  useEffect(() => {
    const cleanup = window.pyitol.platform.onThemeChange(() => {
      if (theme === 'system') {
        applyThemeClass('system')
      }
    })
    return cleanup
  }, [theme])

  // Apply language change at runtime (hot-switch, no page reload)
  useEffect(() => {
    void i18n.changeLanguage(language)
    // Update <html lang> attribute dynamically
    document.documentElement.lang = language
  }, [i18n, language])

  // Restore saved settings on mount
  useEffect(() => {
    const savedTheme = window.pyitol.settings.get('ui/theme', 'system') as
      'light' | 'dark' | 'system'
    const savedLang = window.pyitol.settings.get('ui/language', 'en') as 'zh' | 'en'
    useUIStore.getState().setTheme(savedTheme)
    setLanguage(savedLang)
  }, [setLanguage])

  // Check sidecar connectivity on mount, then keep retrying until it connects.
  // The engine can take a while to start (packaged PyInstaller binary), so a
  // single failed handshake must not put up a permanent "disconnected" banner.
  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0

    const scheduleRetry = (): void => {
      attempt += 1
      const delay = Math.min(attempt * 1000, 3000)
      retryTimer = setTimeout(() => {
        void ping()
      }, delay)
    }

    const ping = async (): Promise<void> => {
      if (cancelled) return
      try {
        await window.pyitol.sidecar.call('handshake', { client: 'renderer', version: '0.3.0' })
        if (!cancelled) setEngineStatus('ready')
      } catch {
        if (!cancelled) {
          setEngineStatus('disconnected')
          scheduleRetry()
        }
      }
    }

    const offCrash = window.pyitol.sidecar.onCrash(() => {
      if (cancelled) return
      setEngineStatus('disconnected')
      scheduleRetry()
    })

    void ping()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      offCrash()
    }
  }, [])

  // Track unsaved changes in the store
  const isDirty = useProjectStore(s => s.isDirty)
  useEffect(() => {
    window.pyitol.dirty.set(isDirty)
  }, [isDirty])

  // Global drag-and-drop file import — actually read dropped files
  useEffect(() => {
    let depth = 0

    const handleDragOver = (e: DragEvent): void => {
      e.preventDefault()
      if (e.dataTransfer?.types.includes('Files')) {
        setDragOverlay(true)
      }
    }

    const handleDragEnter = (e: DragEvent): void => {
      e.preventDefault()
      depth++
      if (e.dataTransfer?.types.includes('Files')) {
        setDragOverlay(true)
      }
    }

    const handleDragLeave = (e: DragEvent): void => {
      e.preventDefault()
      depth--
      if (depth <= 0) {
        depth = 0
        setDragOverlay(false)
      }
    }

    const handleDrop = async (e: DragEvent): Promise<void> => {
      e.preventDefault()
      depth = 0
      setDragOverlay(false)

      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      const pushToast = useToastStore.getState().pushToast

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        // Electron ≥ 32 removed File.path — resolve via preload webUtils bridge
        const filePath = window.pyitol.files.getPathForFile(file)
        if (!filePath) {
          pushToast('error', t('app.status_drop_rejected', { arg: file.name }))
          continue
        }

        const ext = filePath.split('.').pop()?.toLowerCase()
        if (ext === 'pyitolproj') {
          // Open as project
          try {
            const content = await window.pyitol.files.readFile(filePath)
            const data = JSON.parse(content)
            useProjectStore.getState().setProject(data, filePath)
            useProjectStore.getState().markClean()
            useUIStore.getState().setView('workbench')
            // Register the path on both sides so ⌘S works and the recent list updates
            await window.pyitol.project.setCurrentPath(filePath)
            void window.pyitol.project.addRecentProject(
              filePath,
              data.name || 'Untitled Project',
              data.units?.length ?? 0
            )
            pushToast('success', t('app.status_opened', { arg: filePath }))
          } catch {
            pushToast('error', t('app.status_open_failed', { arg: filePath }))
          }
        } else if (['nwk', 'newick', 'tre', 'tree', 'txt'].includes(ext ?? '')) {
          // Detect file type
          const fileType = await window.pyitol.files.detectFileType(filePath)
          if (fileType === 'tree') {
            useProjectStore.getState().setTreePath(filePath)
            useUIStore.getState().setView('workbench')
          } else if (fileType === 'template') {
            // Learn from template file via sidecar
            try {
              const learned = await window.pyitol.sidecar.call('learn_from_file', {
                path: filePath
              })
              if (learned && Array.isArray(learned) && learned.length > 0) {
                for (const unit of learned) {
                  useProjectStore.getState().addUnit(unit as never)
                }
                useUIStore.getState().setView('workbench')
                pushToast('success', t('app.status_imported', { count: learned.length }))
              }
            } catch {
              pushToast('error', t('app.status_import_failed', { arg: filePath }))
            }
          } else {
            pushToast('error', t('app.status_drop_rejected', { arg: filePath }))
          }
        } else {
          pushToast('error', t('app.status_drop_rejected', { arg: filePath }))
        }
      }
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)

    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [t])

  // Window title reflects the project name and dirty state (document window semantics)
  const projectName = useProjectStore(s => s.data?.name ?? null)
  useEffect(() => {
    const base = projectName ? `${projectName} — PyiTOL Studio` : 'PyiTOL Studio'
    document.title = isDirty ? `● ${base}` : base
  }, [projectName, isDirty])

  // Listen for "show-about-dialog" custom event
  useEffect(() => {
    const handler = (): void => setAboutOpen(true)
    window.addEventListener('show-about-dialog', handler)
    return () => window.removeEventListener('show-about-dialog', handler)
  }, [])

  // Listen for menu commands from the main process
  useMenuCommands()
  useKeyboardShortcuts()

  return (
    <div className="h-screen w-screen overflow-hidden bg-canvas text-ink font-text">
      <AnimatePresence mode="wait">
        {view === 'welcome' ? (
          <motion.div
            key="welcome"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
          >
            <WelcomePage engineStatus={engineStatus} />
          </motion.div>
        ) : (
          <motion.div
            key="workbench"
            className="h-full"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Workbench engineStatus={engineStatus} />
          </motion.div>
        )}
      </AnimatePresence>

      {commandPaletteOpen && <CommandPalette />}
      {wizardOpen && <WizardDialog />}
      {uploadDialogOpen && <UploadDialog />}
      <UpdateNotification />
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      <ToastHost />

      {/* Drag overlay */}
      <AnimatePresence>
        {dragOverlay && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
            style={{
              backgroundColor: 'var(--color-accent-surface-strong)',
              backdropFilter: 'blur(4px)'
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="card"
              style={{
                padding: '48px 64px',
                border: '2px dashed var(--color-accent)',
                textAlign: 'center'
              }}
            >
              <p
                style={{
                  fontSize: 'var(--text-body)',
                  fontWeight: 600,
                  color: 'var(--color-accent)'
                }}
              >
                {t('welcome.drop_action')}
              </p>
              <p
                className="mt-xs"
                style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-subtle)' }}
              >
                .pyitolproj · .nwk · .txt
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
