import { useEffect } from 'react'
import type { MenuCommand } from '@shared/types'
import { useUIStore, useToastStore } from '../stores/ui'
import { useProjectStore } from '../stores/project'
import { useTranslation } from 'react-i18next'

/**
 * Listen for menu commands forwarded from the main process.
 * Each command triggers the appropriate action in the UI/project stores.
 *
 * IMPORTANT: The IPC listener and the window 'menu-command' event listener
 * must NOT re-dispatch the same command to each other, otherwise it
 * creates an infinite synchronous recursion.
 *
 * The window 'menu-command' event is for toolbar buttons / E2E tests to
 * trigger the same handler as IPC. The handler itself never dispatches
 * 'menu-command' — it calls store actions directly.
 *
 * Workbench-specific actions (generate preview / export / import template)
 * are dispatched as dedicated custom events ('workbench-generate-preview',
 * 'workbench-export', 'workbench-import') which the Workbench listens for.
 */
export function useMenuCommands(): void {
  const { t } = useTranslation()
  const setCommandPaletteOpen = useUIStore(s => s.setCommandPaletteOpen)
  const setWizardOpen = useUIStore(s => s.setWizardOpen)
  const setUploadDialogOpen = useUIStore(s => s.setUploadDialogOpen)
  const toggleLeftRail = useUIStore(s => s.toggleLeftRail)
  const toggleInspector = useUIStore(s => s.toggleInspector)
  const setView = useUIStore(s => s.setView)

  useEffect(() => {
    const pushToast = useToastStore.getState().pushToast

    /** After a successful save: mark clean, update recent list, sync path state. */
    const afterSave = (savedPath: string): void => {
      const state = useProjectStore.getState()
      state.markClean()
      state.setProjectPath(savedPath)
      if (state.data) {
        void window.pyitol.project.addRecentProject(
          savedPath,
          state.data.name || 'Untitled Project',
          state.data.units.length
        )
      }
      pushToast('success', t('app.status_saved', { arg: savedPath }))
    }

    const handleCommand = async (command: MenuCommand): Promise<void> => {
      switch (command) {
        case 'new-project': {
          const data = await window.pyitol.project.newProject()
          useProjectStore.getState().setProject(data, null)
          useProjectStore.getState().markClean()
          await window.pyitol.project.setCurrentPath(null)
          setView('workbench')
          pushToast('success', t('app.status_new_project'))
          break
        }
        case 'open-project': {
          try {
            const data = await window.pyitol.project.openProject()
            if (data) {
              const path = await window.pyitol.project.getCurrentPath()
              useProjectStore.getState().setProject(data, path)
              useProjectStore.getState().markClean()
              setView('workbench')
              if (path) {
                void window.pyitol.project.addRecentProject(
                  path,
                  data.name || 'Untitled Project',
                  data.units.length
                )
                pushToast('success', t('app.status_opened', { arg: path }))
              }
            }
          } catch (err) {
            pushToast('error', t('app.status_open_failed', { arg: (err as Error).message }))
          }
          break
        }
        case 'save-project': {
          let saved = false
          try {
            const { data, filePath } = useProjectStore.getState()
            if (data) {
              // Resolve the path: renderer filePath first, then the path the
              // main process remembers (covers drag-open / recent-open).
              let path = filePath ?? (await window.pyitol.project.getCurrentPath())
              let savedPath: string | null
              if (path) {
                savedPath = await window.pyitol.project.saveProject(data)
                // Main had no path after all (stale) — fall back to save-as
                if (!savedPath) {
                  savedPath = await window.pyitol.project.saveProjectAs(data)
                }
              } else {
                savedPath = await window.pyitol.project.saveProjectAs(data)
              }
              if (savedPath) {
                afterSave(savedPath)
                saved = true
              }
            }
          } catch (err) {
            pushToast('error', t('app.status_save_failed', { arg: (err as Error).message }))
          } finally {
            // If this save was triggered by the close-intercept dialog, report
            // the outcome so the main process can close (or stay open).
            window.pyitol.project.reportSaveFinished(saved)
          }
          break
        }
        case 'save-project-as': {
          try {
            const { data } = useProjectStore.getState()
            if (data) {
              const savedPath = await window.pyitol.project.saveProjectAs(data)
              if (savedPath) {
                afterSave(savedPath)
              }
            }
          } catch (err) {
            pushToast('error', t('app.status_save_failed', { arg: (err as Error).message }))
          }
          break
        }
        case 'open-wizard':
          setWizardOpen(true)
          break
        case 'open-command-palette':
          setCommandPaletteOpen(true)
          break
        case 'upload-itol':
          setUploadDialogOpen(true)
          break
        case 'toggle-rail':
          toggleLeftRail()
          break
        case 'toggle-inspector':
          toggleInspector()
          break
        case 'toggle-theme': {
          // Cycle handled by menu; just re-apply
          const savedTheme = window.pyitol.settings.get('ui/theme', 'system') as
            'light' | 'dark' | 'system'
          useUIStore.getState().setTheme(savedTheme)
          break
        }
        case 'switch-language': {
          const savedLang = window.pyitol.settings.get('ui/language', 'en') as 'zh' | 'en'
          useUIStore.getState().setLanguage(savedLang)
          break
        }
        case 'open-example': {
          const data = await window.pyitol.project.loadExampleProject()
          if (data) {
            useProjectStore.getState().setProject(data, null, true)
            await window.pyitol.project.setCurrentPath(null)
            setView('workbench')
            pushToast('success', t('app.status_example_loaded'))
          } else {
            pushToast('error', t('app.status_example_missing'))
          }
          break
        }
        case 'generate-preview':
          // Workbench listens for this event and runs its real generatePreview
          window.dispatchEvent(new CustomEvent('workbench-generate-preview'))
          break
        case 'export-template':
          // Workbench listens for this event and runs its real handleExport
          window.dispatchEvent(new CustomEvent('workbench-export'))
          break
        case 'import-template':
          // Workbench listens for this event and runs its real import flow
          window.dispatchEvent(new CustomEvent('workbench-import'))
          break
        case 'show-about':
          // Show about dialog via a dedicated event
          window.dispatchEvent(new CustomEvent('show-about-dialog'))
          break
      }
    }

    const ipcCleanup = window.pyitol.menu.onCommand(handleCommand)

    // Also listen for window-level 'menu-command' custom events
    // (used by toolbar buttons and E2E tests to trigger the SAME handler)
    const windowHandler = (e: Event): void => {
      const command = (e as CustomEvent<MenuCommand>).detail
      if (command) {
        void handleCommand(command)
      }
    }
    window.addEventListener('menu-command', windowHandler)

    return () => {
      ipcCleanup()
      window.removeEventListener('menu-command', windowHandler)
    }
  }, [
    setCommandPaletteOpen,
    setWizardOpen,
    setUploadDialogOpen,
    toggleLeftRail,
    toggleInspector,
    setView,
    t
  ])
}
