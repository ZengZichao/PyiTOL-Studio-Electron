/**
 * UI store — theme, language, panel visibility, layout persistence.
 * Independent of the project document.
 */

import { create } from 'zustand'
import type { ThemeMode } from '@shared/types'

export interface UIState {
  theme: ThemeMode
  language: 'zh' | 'en'
  view: 'welcome' | 'workbench'
  leftRailOpen: boolean
  inspectorOpen: boolean
  leftRailWidth: number
  inspectorWidth: number
  centerSplitRatio: number // 0..1 — proportion for the data table (top), rest for preview (bottom)
  commandPaletteOpen: boolean
  wizardOpen: boolean
  uploadDialogOpen: boolean
  /** Pending wizard pre-selection (template type) requested e.g. from the command palette. */
  wizardPendingType: string | null

  setTheme: (theme: ThemeMode) => void
  setLanguage: (lang: 'zh' | 'en') => void
  setView: (view: 'welcome' | 'workbench') => void
  toggleLeftRail: () => void
  toggleInspector: () => void
  setLeftRailWidth: (width: number) => void
  setInspectorWidth: (width: number) => void
  setCenterSplitRatio: (ratio: number) => void
  setCommandPaletteOpen: (open: boolean) => void
  setWizardOpen: (open: boolean) => void
  setUploadDialogOpen: (open: boolean) => void
  setWizardPendingType: (typeName: string | null) => void
}

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error'
  message: string
  actionLabel?: string
  onAction?: () => void
}

interface ToastState {
  toasts: Toast[]
  pushToast: (
    kind: Toast['kind'],
    message: string,
    action?: { label: string; onAction: () => void }
  ) => void
  dismissToast: (id: number) => void
}

let nextToastId = 1

export const useToastStore = create<ToastState>(set => ({
  toasts: [],
  pushToast: (kind, message, action) =>
    set(s => ({
      toasts: [
        ...s.toasts.slice(-3), // keep at most 4 toasts
        {
          id: nextToastId++,
          kind,
          message,
          actionLabel: action?.label,
          onAction: action?.onAction
        }
      ]
    })),
  dismissToast: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
}))

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

export const useUIStore = create<UIState>(set => ({
  theme: 'system',
  language: 'en',
  view: 'welcome',
  leftRailOpen: true,
  inspectorOpen: true,
  leftRailWidth: 280,
  inspectorWidth: 360,
  centerSplitRatio: 0.5,
  commandPaletteOpen: false,
  wizardOpen: false,
  uploadDialogOpen: false,
  wizardPendingType: null,

  setTheme: theme => set({ theme }),
  setLanguage: language => set({ language }),
  setView: view => set({ view }),
  toggleLeftRail: () => set(s => ({ leftRailOpen: !s.leftRailOpen })),
  toggleInspector: () => set(s => ({ inspectorOpen: !s.inspectorOpen })),
  setLeftRailWidth: leftRailWidth => set({ leftRailWidth: clamp(leftRailWidth, 200, 500) }),
  setInspectorWidth: inspectorWidth => set({ inspectorWidth: clamp(inspectorWidth, 280, 600) }),
  setCenterSplitRatio: centerSplitRatio =>
    set({ centerSplitRatio: clamp(centerSplitRatio, 0.15, 0.85) }),
  setCommandPaletteOpen: commandPaletteOpen => set({ commandPaletteOpen }),
  setWizardOpen: wizardOpen => set({ wizardOpen }),
  setUploadDialogOpen: uploadDialogOpen => set({ uploadDialogOpen }),
  setWizardPendingType: wizardPendingType => set({ wizardPendingType })
}))
