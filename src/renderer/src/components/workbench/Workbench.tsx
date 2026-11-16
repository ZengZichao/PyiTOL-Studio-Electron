import { useTranslation } from 'react-i18next'
import { useProjectStore, unitToSpec, idlCacheKey } from '../../stores/project'
import { useUIStore, useToastStore } from '../../stores/ui'
import { useEffect, useCallback, useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  FilePlus,
  FolderOpen,
  Save,
  Wand2,
  Upload,
  Download,
  RefreshCw,
  Languages,
  Sun,
  Moon,
  Monitor,
  Copy,
  Check,
  Search,
  ChevronDown,
  ChevronRight,
  TreePine,
  Trash2,
  Plus,
  ClipboardPaste
} from 'lucide-react'
import type {
  FormIdl,
  GenerateTemplateResult,
  UnitData,
  FieldSpec,
  EngineStatus
} from '@shared/types'
import { Splitter } from '../ui/Splitter'
import { IdlWidget } from '../inspector/IdlWidget'
import { validateField } from '../../lib/validate'
import { highlightItolTemplate } from '../../lib/highlight'

interface WorkbenchProps {
  engineStatus: EngineStatus
}

export function Workbench({ engineStatus }: WorkbenchProps): JSX.Element {
  const sidecarReady = engineStatus === 'ready'
  const { t } = useTranslation()
  const data = useProjectStore(s => s.data)
  const selectedUnitId = useProjectStore(s => s.selectedUnitId)
  const selectUnit = useProjectStore(s => s.selectUnit)
  const previewText = useProjectStore(s => s.previewText)
  const previewWarnings = useProjectStore(s => s.previewWarnings)
  const previewLoading = useProjectStore(s => s.previewLoading)
  const setPreview = useProjectStore(s => s.setPreview)
  const setPreviewLoading = useProjectStore(s => s.setPreviewLoading)
  const idlCache = useProjectStore(s => s.idlCache)
  const setIdl = useProjectStore(s => s.setIdl)
  const clearIdl = useProjectStore(s => s.clearIdl)
  const leafIds = useProjectStore(s => s.leafIds)
  const setLeafIds = useProjectStore(s => s.setLeafIds)
  const setLeafIdsLoading = useProjectStore(s => s.setLeafIdsLoading)

  // UI layout state
  const leftRailOpen = useUIStore(s => s.leftRailOpen)
  const inspectorOpen = useUIStore(s => s.inspectorOpen)
  const toggleLeftRail = useUIStore(s => s.toggleLeftRail)
  const toggleInspector = useUIStore(s => s.toggleInspector)
  const leftRailWidth = useUIStore(s => s.leftRailWidth)
  const inspectorWidth = useUIStore(s => s.inspectorWidth)
  const centerSplitRatio = useUIStore(s => s.centerSplitRatio)
  const setLeftRailWidth = useUIStore(s => s.setLeftRailWidth)
  const setInspectorWidth = useUIStore(s => s.setInspectorWidth)
  const setCenterSplitRatio = useUIStore(s => s.setCenterSplitRatio)
  const setWizardOpen = useUIStore(s => s.setWizardOpen)
  const setUploadDialogOpen = useUIStore(s => s.setUploadDialogOpen)
  const theme = useUIStore(s => s.theme)
  const setTheme = useUIStore(s => s.setTheme)
  const language = useUIStore(s => s.language)
  const setLanguage = useUIStore(s => s.setLanguage)

  const selectedUnit = data?.units.find(u => u.unit_id === selectedUnitId) ?? null
  const centerRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  // Auto-generate preview when the selected unit or its parameters change
  // Use debounce to avoid calling sidecar on every keystroke
  const previewAbortRef = useRef<AbortController | null>(null)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const generatePreview = useCallback(async () => {
    if (!selectedUnit) {
      setPreview('', [])
      return
    }

    // Mark any in-flight request as stale. The sidecar call itself cannot be
    // aborted over IPC (AbortSignal is not cloneable) — instead the stale
    // result is discarded by the `previewAbortRef.current === ac` guard below.
    if (previewAbortRef.current) {
      previewAbortRef.current.abort()
    }
    const ac = new AbortController()
    previewAbortRef.current = ac

    // Show loading indicator only if we don't have text yet (stale-content marker otherwise)
    if (!useProjectStore.getState().previewText) {
      setPreviewLoading(true)
    }

    try {
      const spec = unitToSpec(selectedUnit)
      const result = await window.pyitol.sidecar.call<GenerateTemplateResult>('generate_template', {
        unit: spec
      })
      // Only set if this is still the latest request
      if (previewAbortRef.current === ac) {
        setPreview(result.text, result.warnings)
      }
    } catch (err) {
      if (previewAbortRef.current === ac) {
        setPreview(`# ${t('preview.generate_failed', { error: (err as Error).message })}`, [])
      }
    } finally {
      if (previewAbortRef.current === ac) {
        setPreviewLoading(false)
        previewAbortRef.current = null
      }
    }
  }, [selectedUnit, setPreview, setPreviewLoading, t])

  // Debounce preview generation
  useEffect(() => {
    if (!selectedUnit || !sidecarReady) return

    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current)
    }
    previewTimerRef.current = setTimeout(() => {
      void generatePreview()
    }, 300)

    return () => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current)
      }
    }
  }, [selectedUnit, generatePreview, sidecarReady])

  // Fetch IDL for the selected unit's type — cache key includes the locale so
  // switching language re-fetches labels in the new language.
  useEffect(() => {
    if (!selectedUnit || !sidecarReady) return
    if (idlCache[idlCacheKey(language, selectedUnit.type_name)]) return

    void window.pyitol.sidecar
      .call<FormIdl>('build_form_idl', {
        type: selectedUnit.type_name,
        locale: language
      })
      .then(idl => {
        setIdl(language, selectedUnit.type_name, idl)
      })
      .catch(err => {
        // IDL fetch failed — set an error marker so the inspector shows an error + retry,
        // not a perpetual loading state.
        console.error('[Workbench] IDL fetch failed:', err)
        setIdl(language, selectedUnit.type_name, {
          type_name: selectedUnit.type_name,
          header: '',
          group_label: '',
          wizard_supported: false,
          no_label_color: false,
          separator_choices: [],
          fields: [],
          groups: [],
          data_columns: [],
          data_column_labels: [],
          data_columns_dynamic: null,
          _error: true,
          _errorMessage: (err as Error).message
        })
      })
  }, [selectedUnit, sidecarReady, idlCache, setIdl, language])

  // Fetch tree leaf IDs when tree path changes
  useEffect(() => {
    if (!data?.tree_path || !sidecarReady) return
    if (leafIds !== null) return

    setLeafIdsLoading(true)
    void window.pyitol.sidecar
      .call<{ leaf_ids: string[] | null }>('tree_leaf_ids', { path: data.tree_path })
      .then(result => {
        setLeafIds(result.leaf_ids ? new Set(result.leaf_ids) : null)
      })
      .catch(() => setLeafIds(null))
      .finally(() => setLeafIdsLoading(false))
  }, [data?.tree_path, sidecarReady, leafIds, setLeafIds, setLeafIdsLoading])

  // ─── Toolbar actions ────────────────────────────────────────────
  const handleNew = useCallback(() => {
    window.dispatchEvent(new CustomEvent('menu-command', { detail: 'new-project' }))
  }, [])

  const handleOpen = useCallback(() => {
    window.dispatchEvent(new CustomEvent('menu-command', { detail: 'open-project' }))
  }, [])

  const handleSave = useCallback(() => {
    window.dispatchEvent(new CustomEvent('menu-command', { detail: 'save-project' }))
  }, [])

  const handleExport = useCallback(async () => {
    if (!selectedUnit) {
      useToastStore.getState().pushToast('error', t('app.status_no_unit'))
      return
    }
    const defaultName = (selectedUnit.label || selectedUnit.type_name) + '.txt'
    const exportPath = await window.pyitol.files.exportTemplate(defaultName)
    if (!exportPath) return
    try {
      await window.pyitol.sidecar.call('export_template_file', {
        unit: unitToSpec(selectedUnit),
        path: exportPath
      })
      useToastStore.getState().pushToast('success', t('app.status_exported', { arg: exportPath }))
    } catch (err) {
      useToastStore
        .getState()
        .pushToast('error', t('app.status_export_failed', { arg: (err as Error).message }))
    }
  }, [selectedUnit, t])

  const handleImport = useCallback(async () => {
    // Import an iTOL template file via the learner (menu ⌘I)
    const path = await window.pyitol.files.pickTemplateFile()
    if (!path) return
    try {
      const learned = await window.pyitol.sidecar.call('learn_from_file', { path })
      if (learned && Array.isArray(learned) && learned.length > 0) {
        for (const unit of learned) {
          useProjectStore.getState().addUnit(unit as never)
        }
        useToastStore
          .getState()
          .pushToast('success', t('app.status_imported', { count: learned.length }))
      } else {
        useToastStore.getState().pushToast('error', t('app.status_import_failed', { arg: path }))
      }
    } catch (err) {
      useToastStore
        .getState()
        .pushToast('error', t('app.status_import_failed', { arg: (err as Error).message }))
    }
  }, [t])

  // Wire the menu commands (⌘E export / ⌘I import / ⌘R generate preview) to the real implementations
  useEffect(() => {
    const onExport = (): void => {
      void handleExport()
    }
    const onImport = (): void => {
      void handleImport()
    }
    const onGenerate = (): void => {
      void generatePreview()
    }
    window.addEventListener('workbench-export', onExport)
    window.addEventListener('workbench-import', onImport)
    window.addEventListener('workbench-generate-preview', onGenerate)
    return () => {
      window.removeEventListener('workbench-export', onExport)
      window.removeEventListener('workbench-import', onImport)
      window.removeEventListener('workbench-generate-preview', onGenerate)
    }
  }, [handleExport, handleImport, generatePreview])

  const handlePreviewRefresh = useCallback(() => {
    void generatePreview()
  }, [generatePreview])

  const handleCopyPreview = useCallback(async () => {
    await window.pyitol.clipboard.writeText(previewText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [previewText])

  const cycleTheme = useCallback(() => {
    const order: Array<'light' | 'dark' | 'system'> = ['system', 'light', 'dark']
    const idx = order.indexOf(theme)
    const next = order[(idx + 1) % order.length]
    setTheme(next)
    window.pyitol.settings.set('ui/theme', next)
  }, [theme, setTheme])

  const toggleLanguage = useCallback(() => {
    const next = language === 'en' ? 'zh' : 'en'
    setLanguage(next)
    window.pyitol.settings.set('ui/language', next)
  }, [language, setLanguage])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <Toolbar
        leftRailOpen={leftRailOpen}
        inspectorOpen={inspectorOpen}
        onToggleRail={toggleLeftRail}
        onToggleInspector={toggleInspector}
        engineStatus={engineStatus}
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        onWizard={() => setWizardOpen(true)}
        onUpload={() => setUploadDialogOpen(true)}
        onExport={handleExport}
        onPreview={handlePreviewRefresh}
        onToggleTheme={cycleTheme}
        onToggleLanguage={toggleLanguage}
        theme={theme}
        language={language}
      />

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left rail — tree card + unit list */}
        <AnimatePresence>
          {leftRailOpen && (
            <>
              <motion.div
                className="flex flex-col border-r border-hairline bg-canvas"
                style={{ width: leftRailWidth }}
                initial={{ x: -280, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -280, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="p-sm">
                  <TreeCard />
                </div>
                <div className="hairline" />
                <UnitList
                  units={data?.units ?? []}
                  selectedId={selectedUnitId}
                  onSelect={selectUnit}
                />
              </motion.div>
              <Splitter
                direction="horizontal"
                onResizeAbsolute={(startSize, offset) => setLeftRailWidth(startSize + offset)}
                startSize={leftRailWidth}
                onResize={delta => setLeftRailWidth(leftRailWidth + delta)}
              />
            </>
          )}
        </AnimatePresence>

        {/* Center — data table + preview */}
        <div ref={centerRef} className="flex flex-1 flex-col overflow-hidden">
          <div style={{ height: `${centerSplitRatio * 100}%` }} className="overflow-hidden">
            <DataTable unit={selectedUnit} leafIds={leafIds} />
          </div>
          <Splitter
            direction="vertical"
            onResizeAbsolute={(startSize, offset) => {
              const h = centerRef.current?.clientHeight ?? 600
              setCenterSplitRatio(startSize / h + offset / h)
            }}
            startSize={(centerRef.current?.clientHeight ?? 600) * centerSplitRatio}
            onResize={delta => {
              const h = centerRef.current?.clientHeight ?? 600
              setCenterSplitRatio(centerSplitRatio + delta / h)
            }}
          />
          <div style={{ flex: 1 }} className="overflow-hidden">
            <PreviewPanel
              text={previewText}
              warnings={previewWarnings}
              loading={previewLoading}
              onCopy={handleCopyPreview}
              copied={copied}
            />
          </div>
        </div>

        {/* Right — inspector */}
        <AnimatePresence>
          {inspectorOpen && (
            <>
              <Splitter
                direction="horizontal"
                onResizeAbsolute={(startSize, offset) => setInspectorWidth(startSize - offset)}
                startSize={inspectorWidth}
                onResize={delta => setInspectorWidth(inspectorWidth - delta)}
              />
              <motion.div
                className="flex flex-col border-l border-hairline bg-canvas"
                style={{ width: inspectorWidth }}
                initial={{ x: 360, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 360, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <InspectorPanel
                  unit={selectedUnit}
                  idl={
                    selectedUnit
                      ? idlCache[idlCacheKey(language, selectedUnit.type_name)]
                      : undefined
                  }
                  onRetryIdl={
                    selectedUnit ? () => clearIdl(language, selectedUnit.type_name) : undefined
                  }
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Toolbar ─────────────────────────────────────────────────────

function Toolbar(props: {
  leftRailOpen: boolean
  inspectorOpen: boolean
  onToggleRail: () => void
  onToggleInspector: () => void
  engineStatus: EngineStatus
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onWizard: () => void
  onUpload: () => void
  onExport: () => void
  onPreview: () => void
  onToggleTheme: () => void
  onToggleLanguage: () => void
  theme: string
  language: string
}): JSX.Element {
  const { t } = useTranslation()
  const {
    leftRailOpen,
    inspectorOpen,
    onToggleRail,
    onToggleInspector,
    engineStatus,
    onNew,
    onOpen,
    onSave,
    onWizard,
    onUpload,
    onExport,
    onPreview,
    onToggleTheme,
    onToggleLanguage,
    theme,
    language
  } = props

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <div
      className="flex items-center justify-between border-b border-hairline drag-region"
      style={{ height: 44, paddingLeft: 80 /* traffic light safe zone */ }}
    >
      <div className="flex items-center no-drag" style={{ gap: '4px' }}>
        <button
          className="btn-pearl no-drag"
          style={{ minWidth: 36, padding: '6px 8px' }}
          onClick={onToggleRail}
          title={t('tb.toggle_rail')}
        >
          {leftRailOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
        <div
          className="no-drag"
          style={{
            width: 1,
            height: 24,
            backgroundColor: 'var(--color-hairline)',
            margin: '0 4px'
          }}
        />
        <button
          className="btn-pearl no-drag"
          style={{ padding: '6px 10px' }}
          onClick={onNew}
          title={t('tb.new')}
        >
          <FilePlus size={14} />
        </button>
        <button
          className="btn-pearl no-drag"
          style={{ padding: '6px 10px' }}
          onClick={onOpen}
          title={t('tb.open')}
        >
          <FolderOpen size={14} />
        </button>
        <button
          className="btn-pearl no-drag"
          style={{ padding: '6px 10px' }}
          onClick={onSave}
          title={t('tb.save')}
        >
          <Save size={14} />
        </button>
        <button
          className="btn-pearl no-drag"
          style={{ padding: '6px 10px' }}
          onClick={onWizard}
          title={t('tb.wizard')}
        >
          <Wand2 size={14} />
        </button>
      </div>

      <div className="flex items-center no-drag" style={{ gap: '4px' }}>
        {engineStatus === 'connecting' && (
          <span className="text-ink-subtle no-drag" style={{ fontSize: 'var(--text-fine-print)' }}>
            ⏳ {t('app.engine_connecting', { defaultValue: 'Python engine connecting…' })}
          </span>
        )}
        {engineStatus === 'disconnected' && (
          <span className="text-ink-subtle no-drag" style={{ fontSize: 'var(--text-fine-print)' }}>
            ⚠ {t('app.engine_disconnected', { defaultValue: 'Python engine not connected' })}
          </span>
        )}
        <button
          className="btn-pearl no-drag"
          style={{ padding: '6px 10px' }}
          onClick={onPreview}
          title={t('tb.preview')}
        >
          <RefreshCw size={14} />
        </button>
        <button
          className="btn-pearl no-drag"
          style={{ padding: '6px 10px' }}
          onClick={onExport}
          title={t('tb.export')}
        >
          <Download size={14} />
        </button>
        <button
          className="btn-pearl no-drag"
          style={{ padding: '6px 10px' }}
          onClick={onUpload}
          title={t('tb.upload')}
        >
          <Upload size={14} />
        </button>
        <div
          className="no-drag"
          style={{
            width: 1,
            height: 24,
            backgroundColor: 'var(--color-hairline)',
            margin: '0 4px'
          }}
        />
        <button
          className="btn-pearl no-drag"
          style={{ padding: '6px 10px' }}
          onClick={onToggleLanguage}
          title={t('tb.language')}
        >
          <Languages size={14} />
          <span style={{ fontSize: 'var(--text-fine-print)', marginLeft: 2 }}>
            {language === 'zh' ? '中' : 'EN'}
          </span>
        </button>
        <button
          className="btn-pearl no-drag"
          style={{ padding: '6px 10px' }}
          onClick={onToggleTheme}
          title={t('tb.theme')}
        >
          <ThemeIcon size={14} />
        </button>
        <div
          className="no-drag"
          style={{
            width: 1,
            height: 24,
            backgroundColor: 'var(--color-hairline)',
            margin: '0 4px'
          }}
        />
        <button
          className="btn-pearl no-drag"
          style={{ minWidth: 36, padding: '6px 8px' }}
          onClick={onToggleInspector}
          title={t('tb.toggle_inspector')}
        >
          {inspectorOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
      </div>
    </div>
  )
}

// ─── Tree Card ───────────────────────────────────────────────────

function TreeCard(): JSX.Element {
  const { t } = useTranslation()
  const data = useProjectStore(s => s.data)
  const setTreePath = useProjectStore(s => s.setTreePath)
  const leafIds = useProjectStore(s => s.leafIds)
  const leafIdsLoading = useProjectStore(s => s.leafIdsLoading)
  const treePath = data?.tree_path ?? ''

  const handlePickTree = useCallback(async () => {
    const path = await window.pyitol.files.pickTreeFile()
    if (path) setTreePath(path)
  }, [setTreePath])

  const matchedCount = useMemo(() => {
    if (!leafIds || !data) return null
    let matched = 0
    let total = 0
    for (const unit of data.units) {
      for (const row of unit.data_rows) {
        const id = row['ID'] ?? row['id'] ?? Object.values(row)[0]
        if (id) {
          total++
          if (leafIds.has(id)) matched++
        }
      }
    }
    return { matched, total }
  }, [leafIds, data])

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="field-label-strong" style={{ fontSize: 'var(--text-caption-strong)' }}>
          <TreePine
            size={13}
            className="mr-xxs inline-block"
            style={{ verticalAlign: 'text-bottom' }}
          />
          {t('nav.tree_card_title')}
        </p>
      </div>
      <p className="text-ink-subtle mt-xxs" style={{ fontSize: 'var(--text-fine-print)' }}>
        {treePath ? t('nav.tree', { name: treePath.split('/').pop() }) : t('nav.tree_none')}
      </p>
      {treePath && (
        <p className="text-ink-subtle mt-xxs" style={{ fontSize: 'var(--text-fine-print)' }}>
          {leafIdsLoading
            ? t('nav.tree_loading')
            : leafIds
              ? t('nav.tree_leaf_count', { count: leafIds.size })
              : t('nav.tree_meta_unknown')}
        </p>
      )}
      {matchedCount && (
        <p className="text-ink-subtle mt-xxs" style={{ fontSize: 'var(--text-fine-print)' }}>
          {t('nav.tree_match', { matched: matchedCount.matched, total: matchedCount.total })}
        </p>
      )}
      <button
        className="btn-pearl mt-xs"
        style={{ width: '100%', minHeight: 32, fontSize: 'var(--text-fine-print)' }}
        onClick={handlePickTree}
      >
        {t('nav.tree_change')}
      </button>
    </div>
  )
}

// ─── Unit List ───────────────────────────────────────────────────

function UnitList({
  units,
  selectedId,
  onSelect
}: {
  units: UnitData[]
  selectedId: string | null
  onSelect: (id: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const removeUnit = useProjectStore(s => s.removeUnit)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return units
    const q = search.toLowerCase()
    return units.filter(
      u =>
        (u.label || u.type_name).toLowerCase().includes(q) || u.type_name.toLowerCase().includes(q)
    )
  }, [units, search])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="px-sm pt-sm pb-xxs">
        <p className="field-label-strong" style={{ fontSize: 'var(--text-caption-strong)' }}>
          {t('nav.units_caption')}
          {units.length > 0 && (
            <span className="text-ink-subtle" style={{ fontWeight: 400 }}>
              {' '}
              ({units.length})
            </span>
          )}
        </p>
      </div>
      {units.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-lg">
          <p className="text-ink-subtle" style={{ fontSize: 'var(--text-caption)' }}>
            {t('inspector.no_unit')}
          </p>
        </div>
      ) : (
        <>
          <div className="px-sm py-xs">
            <div className="relative">
              <Search size={12} className="absolute text-ink-subtle" style={{ left: 8, top: 10 }} />
              <input
                className="input-field"
                style={{ paddingLeft: 26, minHeight: 32, fontSize: 'var(--text-fine-print)' }}
                placeholder={t('nav.search_placeholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {filtered.map(unit => (
              <div
                key={unit.unit_id}
                className={`group flex w-full items-center gap-xs px-sm py-xs transition-colors hover:bg-pearl ${
                  unit.unit_id === selectedId ? 'bg-pearl' : ''
                }`}
                style={{
                  minHeight: 44,
                  borderLeft:
                    unit.unit_id === selectedId
                      ? '2px solid var(--color-accent)'
                      : '2px solid transparent'
                }}
              >
                <button
                  className="flex flex-1 items-center gap-xs overflow-hidden"
                  onClick={() => onSelect(unit.unit_id)}
                >
                  <span
                    className="inline-block rounded-full"
                    style={{ width: 10, height: 10, backgroundColor: unit.color, flexShrink: 0 }}
                  />
                  <div className="flex flex-col items-start overflow-hidden">
                    <span
                      style={{ fontSize: 'var(--text-caption)', fontWeight: 600 }}
                      className="truncate"
                    >
                      {unit.label || unit.type_name}
                    </span>
                    <span
                      className="text-ink-subtle truncate"
                      style={{ fontSize: 'var(--text-fine-print)' }}
                    >
                      {unit.type_name} · {t('unit.row_count', { count: unit.data_rows.length })}
                    </span>
                  </div>
                </button>
                <button
                  className="text-ink-subtle opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 no-drag"
                  style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={e => {
                    e.stopPropagation()
                    if (
                      window.confirm(
                        t('ctx.delete_confirm', { name: unit.label || unit.type_name })
                      )
                    ) {
                      removeUnit(unit.unit_id)
                    }
                  }}
                  title={t('nav.delete')}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Virtualized Data Table ──────────────────────────────────────

function DataTable({
  unit,
  leafIds
}: {
  unit: UnitData | null
  leafIds: Set<string> | null
}): JSX.Element {
  const { t } = useTranslation()
  const updateUnit = useProjectStore(s => s.updateUnit)
  const setWizardOpen = useUIStore(s => s.setWizardOpen)
  const [editing, setEditing] = useState<{ row: number; col: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowIdx: number } | null>(
    null
  )

  /**
   * Replace the whole table with clipboard TSV content — destructive, so it
   * takes a one-step undo snapshot and asks for confirmation first (P1-6).
   */
  const applyClipboardPaste = useCallback(async (): Promise<void> => {
    if (!unit) return
    const text = await window.pyitol.clipboard.readText()
    const lines = text.trim().split(/\r?\n/).filter(Boolean)
    if (lines.length === 0) {
      useToastStore.getState().pushToast('error', t('table.paste_empty'))
      return
    }

    const parsed = lines.map(line => line.split('\t'))
    const header = parsed[0]
    const newRows = parsed.slice(1).map(row => {
      const obj: Record<string, string> = {}
      header.forEach((col, i) => {
        obj[col] = row[i] ?? ''
      })
      return obj
    })

    if (
      !window.confirm(
        t('table.paste_confirm', {
          rows: newRows.length,
          cols: header.length,
          current: unit.data_rows.length
        })
      )
    ) {
      return
    }

    // Snapshot for one-step undo
    useProjectStore.getState().saveTableSnapshot(unit.unit_id)
    updateUnit(unit.unit_id, {
      columns: header,
      data_rows: newRows
    })
    useToastStore
      .getState()
      .pushToast('success', t('app.status_pasted', { count: newRows.length }), {
        label: t('common.undo'),
        onAction: () => useProjectStore.getState().restoreTableSnapshot()
      })
  }, [unit, updateUnit, t])

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault()
      void applyClipboardPaste()
    },
    [applyClipboardPaste]
  )

  if (!unit || unit.data_rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-ink-subtle" style={{ fontSize: 'var(--text-caption)' }}>
          {t('table.empty_title')}
        </p>
        <p className="text-ink-subtle mt-xxs" style={{ fontSize: 'var(--text-fine-print)' }}>
          {t('table.empty_body')}
        </p>
        <button className="btn-pearl mt-sm" onClick={() => setWizardOpen(true)}>
          <Plus size={14} /> {t('table.empty_cta')}
        </button>
      </div>
    )
  }

  const columns = unit.columns
  const rows = unit.data_rows

  // Status column logic
  const getRowStatus = (row: Record<string, string>): 'matched' | 'missing' | 'unchecked' => {
    if (!leafIds) return 'unchecked'
    const id = row['ID'] ?? row['id'] ?? Object.values(row)[0] ?? ''
    if (!id) return 'unchecked'
    return leafIds.has(id) ? 'matched' : 'missing'
  }

  const statusColor: Record<string, string> = {
    matched: 'var(--color-success)',
    missing: 'var(--color-danger)',
    unchecked: 'var(--color-ink-subtle)'
  }

  const updateCell = (rowIdx: number, col: string, value: string): void => {
    if (!unit) return
    const newDataRows = [...unit.data_rows]
    newDataRows[rowIdx] = { ...newDataRows[rowIdx], [col]: value }
    updateUnit(unit.unit_id, { data_rows: newDataRows })
  }

  const deleteRow = (rowIdx: number): void => {
    if (!unit) return
    const newDataRows = unit.data_rows.filter((_, i) => i !== rowIdx)
    updateUnit(unit.unit_id, { data_rows: newDataRows })
  }

  const insertRow = (rowIdx: number): void => {
    if (!unit) return
    const emptyRow: Record<string, string> = {}
    unit.columns.forEach(col => {
      emptyRow[col] = ''
    })
    const newDataRows = [...unit.data_rows]
    newDataRows.splice(rowIdx, 0, emptyRow)
    updateUnit(unit.unit_id, { data_rows: newDataRows })
  }

  const duplicateRow = (rowIdx: number): void => {
    if (!unit) return
    const newDataRows = [...unit.data_rows]
    const dup = { ...unit.data_rows[rowIdx] }
    newDataRows.splice(rowIdx + 1, 0, dup)
    updateUnit(unit.unit_id, { data_rows: newDataRows })
  }

  const addRow = (): void => {
    if (!unit) return
    const emptyRow: Record<string, string> = {}
    unit.columns.forEach(col => {
      emptyRow[col] = ''
    })
    updateUnit(unit.unit_id, { data_rows: [...unit.data_rows, emptyRow] })
  }

  // Virtualized rendering: cap visible rows and use windowing
  const MAX_RENDER = 5000
  const visibleRows = rows.slice(0, MAX_RENDER)

  return (
    <div className="flex h-full flex-col">
      {/* Table header bar */}
      <div
        className="flex items-center justify-between border-b border-hairline px-sm"
        style={{ height: 32, flexShrink: 0 }}
      >
        <span className="text-ink-subtle" style={{ fontSize: 'var(--text-fine-print)' }}>
          {t('table.footer_count', {
            rows: rows.length,
            matched: leafIds ? rows.filter(r => getRowStatus(r) === 'matched').length : 0,
            pending: leafIds ? rows.filter(r => getRowStatus(r) !== 'matched').length : rows.length
          })}
        </span>
        <div className="flex items-center gap-xs">
          <button
            className="btn-pearl"
            style={{ minHeight: 26, padding: '4px 8px', fontSize: 'var(--text-fine-print)' }}
            onClick={addRow}
          >
            <Plus size={11} /> {t('table.add_row')}
          </button>
          <button
            className="btn-pearl"
            style={{ minHeight: 26, padding: '4px 8px', fontSize: 'var(--text-fine-print)' }}
            onClick={() => void applyClipboardPaste()}
          >
            <ClipboardPaste size={11} /> {t('table.paste_tsv')}
          </button>
        </div>
      </div>

      {/* Table body */}
      <div
        className="flex-1 overflow-auto"
        onPaste={handlePaste}
        onContextMenu={e => {
          e.preventDefault()
          setContextMenu({ x: e.clientX, y: e.clientY, rowIdx: -1 })
        }}
      >
        <table
          className="w-full"
          style={{ fontSize: 'var(--text-caption)', borderCollapse: 'collapse' }}
        >
          <thead className="sticky top-0 bg-parchment">
            <tr>
              <th
                className="px-sm py-xs text-left font-semibold text-ink-muted border-b border-hairline"
                style={{ width: 40 }}
              >
                #
              </th>
              <th
                className="px-sm py-xs text-left font-semibold text-ink-muted border-b border-hairline"
                style={{ width: 60 }}
              >
                {t('table.col_status')}
              </th>
              {columns.map(col => (
                <th
                  key={col}
                  className="px-sm py-xs text-left font-semibold text-ink-muted border-b border-hairline whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => {
              const status = getRowStatus(row)
              return (
                <tr
                  key={i}
                  className="hover:bg-pearl transition-colors"
                  onContextMenu={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    setContextMenu({ x: e.clientX, y: e.clientY, rowIdx: i })
                  }}
                >
                  <td
                    className="px-sm py-xs text-ink-subtle cell-mono border-b border-divider-soft"
                    style={{ width: 40 }}
                  >
                    {i + 1}
                  </td>
                  <td className="px-sm py-xs border-b border-divider-soft" style={{ width: 60 }}>
                    <span
                      className="inline-block rounded-full"
                      style={{
                        width: 8,
                        height: 8,
                        backgroundColor: statusColor[status]
                      }}
                      title={t(`table.status_${status}`)}
                    />
                  </td>
                  {columns.map(col => (
                    <td key={col} className="px-sm py-xs cell-mono border-b border-divider-soft">
                      {editing?.row === i && editing.col === col ? (
                        <input
                          autoFocus
                          className="input-field"
                          style={{ minHeight: 28, padding: '2px 6px' }}
                          defaultValue={row[col] ?? ''}
                          onBlur={e => {
                            updateCell(i, col, e.target.value)
                            setEditing(null)
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              updateCell(i, col, (e.target as HTMLInputElement).value)
                              setEditing(null)
                            } else if (e.key === 'Escape') {
                              setEditing(null)
                            }
                          }}
                        />
                      ) : (
                        <span
                          style={{ cursor: 'text', display: 'block', minHeight: 20 }}
                          onDoubleClick={() => setEditing({ row: i, col })}
                        >
                          {row[col] ?? ''}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length > MAX_RENDER && (
          <p className="p-sm text-ink-subtle" style={{ fontSize: 'var(--text-fine-print)' }}>
            {t('table.truncated', { shown: MAX_RENDER, total: rows.length })}
          </p>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={e => {
              e.preventDefault()
              setContextMenu(null)
            }}
          />
          <div
            className="card fixed z-50"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              padding: '4px 0',
              minWidth: 160,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)'
            }}
          >
            {contextMenu.rowIdx >= 0 && (
              <>
                <MenuItem
                  onClick={() => {
                    insertRow(contextMenu.rowIdx)
                    setContextMenu(null)
                  }}
                >
                  {t('table.ctx_insert_row')}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    duplicateRow(contextMenu.rowIdx)
                    setContextMenu(null)
                  }}
                >
                  {t('table.ctx_duplicate_row')}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    deleteRow(contextMenu.rowIdx)
                    setContextMenu(null)
                  }}
                  danger
                >
                  {t('table.ctx_delete_row')}
                </MenuItem>
                <div className="hairline my-xxs" />
              </>
            )}
            <MenuItem
              onClick={() => {
                if (window.confirm(t('table.ctx_clear_confirm'))) {
                  if (unit) {
                    useProjectStore.getState().saveTableSnapshot(unit.unit_id)
                    updateUnit(unit.unit_id, { data_rows: [] })
                    useToastStore.getState().pushToast('success', t('app.status_cleared'), {
                      label: t('common.undo'),
                      onAction: () => useProjectStore.getState().restoreTableSnapshot()
                    })
                  }
                }
                setContextMenu(null)
              }}
              danger
            >
              {t('table.ctx_clear_data')}
            </MenuItem>
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  danger
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}): JSX.Element {
  return (
    <button
      className="flex w-full items-center px-sm py-xs text-left transition-colors hover:bg-pearl"
      style={{
        fontSize: 'var(--text-caption)',
        color: danger ? 'var(--color-danger)' : 'var(--color-ink)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        minHeight: 32
      }}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// ─── Preview Panel ───────────────────────────────────────────────

function PreviewPanel({
  text,
  warnings,
  loading,
  onCopy,
  copied
}: {
  text: string
  warnings: string[]
  loading: boolean
  onCopy: () => void
  copied: boolean
}): JSX.Element {
  const { t } = useTranslation()

  if (loading && !text) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-ink-subtle" style={{ fontSize: 'var(--text-caption)' }}>
          {t('common.loading')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Preview toolbar */}
      <div
        className="flex items-center justify-between border-b border-hairline px-sm"
        style={{ height: 32, flexShrink: 0 }}
      >
        <span
          className="text-ink-subtle flex items-center"
          style={{ fontSize: 'var(--text-fine-print)', gap: 6 }}
        >
          {loading && (
            <>
              <RefreshCw
                size={11}
                className="animate-spin"
                style={{ color: 'var(--color-accent)' }}
              />
              {t('preview.updating')}
            </>
          )}
          {warnings.length > 0 && (
            <span style={{ color: 'var(--color-danger)' }}>
              ⚠ {t('preview.warning_count', { count: warnings.length })}
            </span>
          )}
        </span>
        {text && (
          <button
            className="btn-pearl"
            style={{ minHeight: 26, padding: '4px 8px', fontSize: 'var(--text-fine-print)' }}
            onClick={onCopy}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? t('common.copied') : t('preview.copy')}
          </button>
        )}
      </div>

      {/* Preview content */}
      {text ? (
        <pre
          className="flex-1 overflow-auto p-sm font-mono text-ink"
          style={{ fontSize: 'var(--text-fine-print)', lineHeight: 1.6 }}
        >
          <code dangerouslySetInnerHTML={{ __html: highlightItolTemplate(text) }} />
        </pre>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-ink-subtle" style={{ fontSize: 'var(--text-caption)' }}>
            {t('preview.placeholder')}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Inspector Panel ─────────────────────────────────────────────

function InspectorPanel({
  unit,
  idl,
  onRetryIdl
}: {
  unit: UnitData | null
  idl: FormIdl | undefined
  onRetryIdl?: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const updateUnit = useProjectStore(s => s.updateUnit)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  if (!unit) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-lg">
        <p className="text-ink-subtle" style={{ fontSize: 'var(--text-caption)' }}>
          {t('inspector.no_unit')}
        </p>
      </div>
    )
  }

  const groups = idl?.groups ?? []
  const allFields = idl?.fields ?? []

  // Filter fields by search
  const filteredGroups = search
    ? groups
        .map(g => ({
          ...g,
          fields: g.fields.filter(
            f =>
              f.label.toLowerCase().includes(search.toLowerCase()) ||
              f.key.toLowerCase().includes(search.toLowerCase())
          )
        }))
        .filter(g => g.fields.length > 0)
    : groups

  // Compute validation errors
  const errors: Record<string, string> = {}
  if (idl) {
    for (const field of allFields) {
      const value = unit.parameters[field.key] ?? String(field.default)
      const err = validateField(field, value)
      if (err) errors[field.key] = err
    }
  }

  const errorCount = Object.keys(errors).length

  const setParam = (key: string, value: string): void => {
    const params = { ...unit.parameters, [key]: value }
    updateUnit(unit.unit_id, { parameters: params })
  }

  const resetField = (field: FieldSpec): void => {
    const params = { ...unit.parameters }
    delete params[field.key]
    updateUnit(unit.unit_id, { parameters: params })
  }

  const resetAll = (): void => {
    if (window.confirm(t('inspector.reset_all_confirm'))) {
      updateUnit(unit.unit_id, { parameters: {} })
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Inspector header */}
      <div className="border-b border-hairline p-sm" style={{ flexShrink: 0 }}>
        <div className="flex items-center justify-between">
          <p className="field-label-strong" style={{ fontSize: 'var(--text-caption-strong)' }}>
            {unit.label || unit.type_name}
          </p>
          {idl && (
            <button
              className="text-ink-subtle hover:text-ink"
              style={{
                padding: '2px 6px',
                fontSize: 'var(--text-fine-print)',
                background: 'none',
                border: 'none',
                cursor: 'pointer'
              }}
              onClick={resetAll}
              title={t('inspector.reset_all')}
            >
              {t('inspector.reset_all')}
            </button>
          )}
        </div>
        {idl && (
          <p className="text-ink-subtle mt-xxs" style={{ fontSize: 'var(--text-fine-print)' }}>
            {t('inspector.param_count', { count: allFields.length })} ·{' '}
            {t('unit.row_count', { count: unit.data_rows.length })}
          </p>
        )}
      </div>

      {/* Search box */}
      {idl && allFields.length > 0 && (
        <div className="px-sm py-xs" style={{ flexShrink: 0 }}>
          <div className="relative">
            <Search size={12} className="absolute text-ink-subtle" style={{ left: 8, top: 10 }} />
            <input
              className="input-field"
              style={{ paddingLeft: 26, minHeight: 32, fontSize: 'var(--text-fine-print)' }}
              placeholder={t('inspector.search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Validation banner */}
      {idl && allFields.length > 0 && (
        <div
          className="mx-sm mb-xs rounded-sm px-sm py-xs"
          style={{
            flexShrink: 0,
            backgroundColor:
              errorCount > 0 ? 'var(--color-danger-surface)' : 'var(--color-accent-surface)',
            fontSize: 'var(--text-fine-print)'
          }}
        >
          {errorCount > 0
            ? t('inspector.banner_fields', { count: errorCount })
            : t('inspector.banner_ok')}
        </div>
      )}

      {/* Scrollable field area */}
      <div className="flex-1 overflow-auto p-sm">
        {/* IDL fetch failed — show error + retry instead of perpetual loading (P1-3) */}
        {idl?._error && (
          <div className="flex flex-col items-center" style={{ gap: 8, padding: '24px 0' }}>
            <p className="text-ink-subtle" style={{ fontSize: 'var(--text-caption)' }}>
              {t('inspector.idl_failed')}
            </p>
            {idl._errorMessage && (
              <p
                className="text-ink-subtle"
                style={{
                  fontSize: 'var(--text-fine-print)',
                  maxWidth: '100%',
                  wordBreak: 'break-all',
                  padding: '0 8px',
                  textAlign: 'center'
                }}
                data-selectable
              >
                {idl._errorMessage}
              </p>
            )}
            {onRetryIdl && (
              <button className="btn-pearl" style={{ minHeight: 28 }} onClick={onRetryIdl}>
                {t('common.retry')}
              </button>
            )}
          </div>
        )}

        {!idl?._error && groups.length === 0 && (
          <p className="text-ink-subtle" style={{ fontSize: 'var(--text-caption)' }}>
            {t('common.loading')}
          </p>
        )}

        {filteredGroups.map(group => {
          const isCollapsed = collapsedGroups.has(group.key)
          return (
            <div key={group.key} className="mb-sm">
              <button
                className="flex w-full items-center justify-between py-xs"
                style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                onClick={() => toggleGroup(group.key)}
              >
                <span
                  className="field-label-strong"
                  style={{ fontSize: 'var(--text-caption-strong)' }}
                >
                  {t(`inspector.group.${group.key}`)}
                </span>
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>

              {!isCollapsed && (
                <div className="flex flex-col gap-xs">
                  {group.fields.map(field => {
                    // Skip label/color if no_label_color
                    if (idl?.no_label_color && (field.key === 'label' || field.key === 'color')) {
                      return null
                    }
                    const value = unit.parameters[field.key] ?? String(field.default)
                    const error = errors[field.key]
                    return (
                      <div key={field.key}>
                        <IdlWidget
                          field={field}
                          value={value}
                          onChange={v => setParam(field.key, v)}
                          onReset={() => resetField(field)}
                        />
                        {error && (
                          <p
                            className="mt-xxs"
                            style={{
                              fontSize: 'var(--text-fine-print)',
                              color: 'var(--color-danger)'
                            }}
                          >
                            {t(`inspector.field_${error}`, {
                              field: field.label,
                              value,
                              range:
                                field.range ?? `${field.minimum ?? '—'}–${field.maximum ?? '—'}`
                            })}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
