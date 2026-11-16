/**
 * Project store — the central state for the loaded .pyitolproj document.
 *
 * Holds: project data, selected unit, dirty flag, current file path.
 * All sidecar calls go through this store (or hooks that use it).
 */

import { create } from 'zustand'
import type { PyitolProjectData, UnitData, UnitSpec, FormIdl } from '@shared/types'

export interface ProjectState {
  // Document
  data: PyitolProjectData | null
  filePath: string | null
  isDirty: boolean
  isExample: boolean

  // Selection
  selectedUnitId: string | null

  // Sidecar-fetched data per unit — keyed by `${locale}:${type_name}` so a
  // language switch re-fetches labels in the new language (P2-1).
  idlCache: Record<string, FormIdl>
  previewText: string
  previewWarnings: string[]
  previewLoading: boolean

  // Tree validation
  leafIds: Set<string> | null
  leafIdsLoading: boolean

  // One-step undo snapshot for destructive table ops (paste-replace / clear).
  tableSnapshot: { unitId: string; columns: string[]; dataRows: Record<string, string>[] } | null

  // Actions
  setProject: (data: PyitolProjectData, filePath: string | null, isExample?: boolean) => void
  /** Sync the renderer-side path after a main-process-side save/open. */
  setProjectPath: (path: string | null) => void
  setTreePath: (path: string) => void
  addUnit: (unit: UnitData) => void
  removeUnit: (unitId: string) => void
  updateUnit: (unitId: string, patch: Partial<UnitData>) => void
  selectUnit: (unitId: string | null) => void
  markDirty: () => void
  markClean: () => void
  setPreview: (text: string, warnings: string[]) => void
  setPreviewLoading: (loading: boolean) => void
  setIdl: (locale: string, typeName: string, idl: FormIdl) => void
  clearIdl: (locale: string, typeName: string) => void
  setLeafIds: (ids: Set<string> | null) => void
  setLeafIdsLoading: (loading: boolean) => void
  saveTableSnapshot: (unitId: string) => void
  restoreTableSnapshot: () => void
  getSelectedUnit: () => UnitData | null
}

/** Cache key for the IDL — includes locale so language switches re-fetch. */
export function idlCacheKey(locale: string, typeName: string): string {
  return `${locale}:${typeName}`
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  data: null,
  filePath: null,
  isDirty: false,
  isExample: false,
  selectedUnitId: null,
  idlCache: {},
  previewText: '',
  previewWarnings: [],
  previewLoading: false,
  leafIds: null,
  leafIdsLoading: false,
  tableSnapshot: null,

  setProject: (data, filePath, isExample = false) =>
    set({
      // Normalize legacy UPPERCASE type names ("DATASET_COLORSTRIP") to the
      // engine's canonical lowercase form — the registry is case-sensitive.
      data: {
        ...data,
        units: data.units.map(u =>
          u.type_name === u.type_name.toLowerCase()
            ? u
            : { ...u, type_name: u.type_name.toLowerCase() }
        )
      },
      filePath,
      isDirty: false,
      isExample,
      selectedUnitId: data.units.length > 0 ? data.units[0].unit_id : null,
      previewText: '',
      previewWarnings: [],
      leafIds: null
    }),

  setProjectPath: path => set({ filePath: path }),

  setTreePath: path => {
    const { data } = get()
    if (!data) return
    set({ data: { ...data, tree_path: path }, isDirty: true, leafIds: null })
  },

  addUnit: unit => {
    const { data } = get()
    if (!data) return
    const normalized =
      unit.type_name === unit.type_name.toLowerCase()
        ? unit
        : { ...unit, type_name: unit.type_name.toLowerCase() }
    set({
      data: { ...data, units: [...data.units, normalized] },
      isDirty: true,
      selectedUnitId: unit.unit_id
    })
  },

  removeUnit: unitId => {
    const { data } = get()
    if (!data) return
    const units = data.units.filter(u => u.unit_id !== unitId)
    const { selectedUnitId } = get()
    set({
      data: { ...data, units },
      isDirty: true,
      selectedUnitId: selectedUnitId === unitId ? (units[0]?.unit_id ?? null) : selectedUnitId
    })
  },

  updateUnit: (unitId, patch) => {
    const { data } = get()
    if (!data) return
    const units = data.units.map(u => (u.unit_id === unitId ? { ...u, ...patch } : u))
    set({ data: { ...data, units }, isDirty: true })
  },

  selectUnit: unitId => set({ selectedUnitId: unitId }),

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),

  setPreview: (text, warnings) => set({ previewText: text, previewWarnings: warnings }),
  setPreviewLoading: loading => set({ previewLoading: loading }),

  setIdl: (locale, typeName, idl) =>
    set(state => ({ idlCache: { ...state.idlCache, [idlCacheKey(locale, typeName)]: idl } })),

  clearIdl: (locale, typeName) =>
    set(state => {
      const next = { ...state.idlCache }
      delete next[idlCacheKey(locale, typeName)]
      return { idlCache: next }
    }),

  setLeafIds: ids => set({ leafIds: ids }),
  setLeafIdsLoading: loading => set({ leafIdsLoading: loading }),

  saveTableSnapshot: unitId => {
    const { data } = get()
    const unit = data?.units.find(u => u.unit_id === unitId)
    if (!unit) return
    // Deep-copy rows so later edits don't mutate the snapshot
    set({
      tableSnapshot: {
        unitId,
        columns: [...unit.columns],
        dataRows: unit.data_rows.map(r => ({ ...r }))
      }
    })
  },

  restoreTableSnapshot: () => {
    const { tableSnapshot } = get()
    if (!tableSnapshot) return
    get().updateUnit(tableSnapshot.unitId, {
      columns: tableSnapshot.columns,
      data_rows: tableSnapshot.dataRows
    })
    set({ tableSnapshot: null })
  },

  getSelectedUnit: () => {
    const { data, selectedUnitId } = get()
    if (!data || !selectedUnitId) return null
    return data.units.find(u => u.unit_id === selectedUnitId) ?? null
  }
}))

/**
 * Convert a UnitData (project model) to a UnitSpec (sidecar call payload).
 */
export function unitToSpec(unit: UnitData): UnitSpec {
  return {
    type_name: unit.type_name,
    label: unit.label,
    color: unit.color,
    separator: unit.separator,
    columns: unit.columns,
    data_rows: unit.data_rows,
    parameters: unit.parameters,
    legend: unit.legend,
    template_name: unit.label
  }
}
