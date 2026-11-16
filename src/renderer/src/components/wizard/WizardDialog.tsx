import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../stores/ui'
import { useProjectStore } from '../../stores/project'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Upload as UploadIcon,
  Check,
  FileText,
  AlertCircle
} from 'lucide-react'
import type { TemplateTypeInfo, FormIdl, GenerateTemplateResult, UnitData } from '@shared/types'
import { IdlWidget } from '../inspector/IdlWidget'
import { highlightItolTemplate } from '../../lib/highlight'
import { unitToSpec } from '../../stores/project'
import { useDialog } from '../../hooks/useDialog'

const WIZARD_GROUPS: Array<{ key: string; types: string[] }> = [
  {
    key: 'basic',
    types: [
      'DATASET_BINARY',
      'DATASET_GRADIENT',
      'DATASET_COLORSTRIP',
      'DATASET_COLORSQUARE',
      'DATASET_TEXT',
      'DATASET_SYMBOL',
      'DATASET_EXTERNALSHAPE'
    ]
  },
  {
    key: 'matrix',
    types: [
      'DATASET_HEATMAP',
      'DATASET_DOMAINS',
      'DATASET_SIMPLEBAR',
      'DATASET_MULTIBAR',
      'DATASET_BOXPLOT',
      'DATASET_LINECHART',
      'DATASET_PIECHART'
    ]
  },
  {
    key: 'structure',
    types: [
      'DATASET_CONNECTOR',
      'DATASET_IMAGE',
      'DATASET_PRIMITIVE',
      'DATASET_CDS',
      'DATASET_TRACK'
    ]
  },
  {
    key: 'other',
    types: [
      'DATASET_BRANCH_COLORS',
      'DATASET_LABELS',
      'DATASET_BACKBONE',
      'DATASET_ALIGN',
      'DATASET_DOT',
      'DATASET_RINGDATA',
      'TREE_COLORS',
      'DATASET_STYLE',
      'TREE_LAYOUT',
      'DATASET_HIDDEN_BRANCHES',
      'DATASET_DECORATION'
    ]
  }
]

function genId(): string {
  return 'unit-' + Math.random().toString(36).slice(2, 10)
}

export function WizardDialog(): JSX.Element {
  const { t } = useTranslation()
  const setOpen = useUIStore(s => s.setWizardOpen)
  const addUnit = useProjectStore(s => s.addUnit)
  const language = useUIStore(s => s.language)

  const [step, setStep] = useState(0)
  const [allTypes, setAllTypes] = useState<TemplateTypeInfo[]>([])
  const [typeQuery, setTypeQuery] = useState('')
  const [typesLoading, setTypesLoading] = useState(true)
  const [selectedType, setSelectedType] = useState<TemplateTypeInfo | null>(null)
  const [idl, setIdl] = useState<FormIdl | null>(null)
  const [idlError, setIdlError] = useState(false)
  const [label, setLabel] = useState('')
  const [color, setColor] = useState('#dd4477')
  const [separator, setSeparator] = useState('TAB')
  const [columns, setColumns] = useState<string[]>([])
  const [dataRows, setDataRows] = useState<Record<string, string>[]>([])
  const [parameters, setParameters] = useState<Record<string, string>>({})
  const [previewText, setPreviewText] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [dataInput, setDataInput] = useState('')
  const [error, setError] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const headerRef = useRef<HTMLDivElement>(null)
  // Tracks which type the columns/parameters were initialized for (language
  // switches re-fetch the IDL but must not wipe user input)
  const initializedForRef = useRef<string | null>(null)
  // Last valid colour — invalid text input falls back to this on blur
  const lastValidColorRef = useRef('#dd4477')
  const containerRef = useDialog(true, () => {
    // If user has made progress, ask for confirmation
    if (step > 0 || selectedType || dataInput) {
      setConfirmDiscard(true)
    } else {
      setOpen(false)
    }
  })

  // Fetch template types on mount — store as the full list
  useEffect(() => {
    void window.pyitol.sidecar
      .call<TemplateTypeInfo[]>('list_template_types', {})
      .then(result => {
        setAllTypes(result)
        setTypesLoading(false)
      })
      .catch(() => setTypesLoading(false))
  }, [])

  // Pre-select a template type requested from the command palette
  const wizardPendingType = useUIStore(s => s.wizardPendingType)
  const setWizardPendingType = useUIStore(s => s.setWizardPendingType)
  useEffect(() => {
    if (!wizardPendingType || allTypes.length === 0) return
    const match = allTypes.find(
      tp => tp.type_name.toLowerCase() === wizardPendingType.toLowerCase()
    )
    if (match) setSelectedType(match)
    setWizardPendingType(null)
  }, [wizardPendingType, allTypes, setWizardPendingType])

  // Filter types based on query — always filter from full list
  const types = useMemo(() => {
    if (!typeQuery) return allTypes
    const q = typeQuery.toLowerCase()
    return allTypes.filter(
      tp => tp.type_name.toLowerCase().includes(q) || tp.group_label.toLowerCase().includes(q)
    )
  }, [allTypes, typeQuery])

  // Fetch IDL when type is selected. On language switch the IDL re-fetches but
  // already-entered columns / parameters are preserved (P2-1).
  useEffect(() => {
    if (!selectedType) return
    setIdlError(false)
    void window.pyitol.sidecar
      .call<FormIdl>('build_form_idl', {
        type: selectedType.type_name,
        locale: language
      })
      .then(result => {
        setIdl(result)
        // Reset columns/defaults when a DIFFERENT type is selected, but preserve
        // user input when this is just a language-switch re-fetch of the same type.
        const sameType = initializedForRef.current === selectedType.type_name
        setColumns(prev => (sameType && prev.length > 0 ? prev : selectedType.required_columns))
        setParameters(prev => {
          if (sameType && Object.keys(prev).length > 0) return prev
          const defaults: Record<string, string> = {}
          for (const field of result.fields) {
            defaults[field.key] = String(field.default)
          }
          return defaults
        })
        if (result.no_label_color) {
          setLabel(selectedType.type_name.replace('DATASET_', '').toLowerCase())
          setColor('#dd4477')
        }
        initializedForRef.current = selectedType.type_name
      })
      .catch(() => {
        setIdl(null)
        setIdlError(true)
      })
  }, [selectedType, language])

  // Parse data input using the selected separator
  const parseLine = useCallback(
    (line: string): string[] => {
      switch (separator) {
        case 'COMMA':
          return line.split(',')
        case 'SEMICOLON':
          return line.split(';')
        case 'SPACE':
          return line.split(/\s+/)
        default: // TAB
          return line.split('\t')
      }
    },
    [separator]
  )

  useEffect(() => {
    if (!dataInput.trim()) {
      if (step >= 2) {
        setDataRows([])
      }
      return
    }
    const lines = dataInput.trim().split(/\r?\n/).filter(Boolean)
    if (lines.length === 0) return
    const parsed = lines.map(line => parseLine(line))
    const header = parsed[0]

    // Use the user-provided header if it differs from required_columns
    // or if columns haven't been set yet
    const newColumns =
      header.length > columns.length || header.some((h, i) => h !== columns[i]) ? header : columns

    if (newColumns !== columns) {
      setColumns(newColumns)
    }

    const rows = parsed.slice(1).map(row => {
      const obj: Record<string, string> = {}
      newColumns.forEach((col, i) => {
        obj[col] = row[i] ?? ''
      })
      return obj
    })
    setDataRows(rows)
  }, [dataInput, step, columns, parseLine])

  // Generate preview
  const generatePreview = useCallback(async () => {
    if (!selectedType) return
    setPreviewLoading(true)
    setError('')
    try {
      const unitData: UnitData = {
        unit_id: 'preview',
        type_name: selectedType.type_name,
        label,
        color,
        separator,
        columns,
        data_rows: dataRows,
        parameters,
        legend: {},
        source: 'manual'
      }
      const result = await window.pyitol.sidecar.call<GenerateTemplateResult>('generate_template', {
        unit: unitToSpec(unitData)
      })
      setPreviewText(result.text)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPreviewLoading(false)
    }
  }, [selectedType, label, color, separator, columns, dataRows, parameters])

  // Auto-generate preview on step 3
  useEffect(() => {
    if (step === 3 && selectedType) {
      void generatePreview()
    }
  }, [step, selectedType, generatePreview])

  const handleFinish = useCallback(() => {
    if (!selectedType) return
    const unit: UnitData = {
      unit_id: genId(),
      type_name: selectedType.type_name,
      label: label || selectedType.type_name,
      color,
      separator,
      columns,
      data_rows: dataRows,
      parameters,
      legend: {},
      source: 'manual'
    }
    addUnit(unit)
    setOpen(false)
  }, [selectedType, label, color, separator, columns, dataRows, parameters, addUnit, setOpen])

  const handleExport = useCallback(async () => {
    if (!selectedType) return
    const defaultName = (label || selectedType.type_name) + '.txt'
    const exportPath = await window.pyitol.files.exportTemplate(defaultName)
    if (!exportPath) return
    const unitData: UnitData = {
      unit_id: 'preview',
      type_name: selectedType.type_name,
      label,
      color,
      separator,
      columns,
      data_rows: dataRows,
      parameters,
      legend: {},
      source: 'manual'
    }
    try {
      await window.pyitol.sidecar.call('export_template_file', {
        unit: unitToSpec(unitData),
        path: exportPath
      })
    } catch (err) {
      setError((err as Error).message)
    }
  }, [selectedType, label, color, separator, columns, dataRows, parameters])

  // Allow next even if there are no data rows (some types don't need data)
  const canNext = useMemo(() => {
    if (step === 0) return selectedType !== null
    if (step === 1) return columns.length > 0
    return true
  }, [step, selectedType, columns])

  const steps = [
    t('wizard.step1_label'),
    t('wizard.step2_label'),
    t('wizard.step3_label'),
    t('wizard.step4_label')
  ]

  return (
    <>
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => {
            if (step > 0 || selectedType || dataInput) {
              setConfirmDiscard(true)
            } else {
              setOpen(false)
            }
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wizard-title"
            tabIndex={-1}
            className="card flex flex-col no-drag"
            style={{ width: '90%', maxWidth: 880, maxHeight: '90vh', padding: 0 }}
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header — step indicator */}
            <div
              ref={headerRef}
              className="flex items-center justify-between border-b border-hairline"
              style={{ flexShrink: 0, padding: '0 24px', height: 56 }}
            >
              <h2 id="wizard-title" style={{ fontSize: 'var(--text-tagline)', fontWeight: 600 }}>
                {t('wizard.title')}
              </h2>
              <div className="flex items-center" style={{ gap: '8px' }}>
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center" style={{ gap: '8px' }}>
                    <div
                      className="flex items-center justify-center rounded-full"
                      style={{
                        width: 24,
                        height: 24,
                        fontSize: 'var(--text-fine-print)',
                        fontWeight: 600,
                        backgroundColor:
                          i === step
                            ? 'var(--color-accent)'
                            : i < step
                              ? 'var(--color-accent)'
                              : 'var(--color-surface-chip)',
                        color: i <= step ? 'var(--color-accent-fg)' : 'var(--color-ink-subtle)',
                        transition: 'all 0.2s ease'
                      }}
                      aria-current={i === step ? 'step' : undefined}
                    >
                      {i < step ? <Check size={12} /> : i + 1}
                    </div>
                    <span
                      style={{
                        fontSize: 'var(--text-fine-print)',
                        color: i === step ? 'var(--color-ink)' : 'var(--color-ink-subtle)',
                        fontWeight: i === step ? 600 : 400
                      }}
                    >
                      {s}
                    </span>
                    {i < steps.length - 1 && (
                      <div
                        style={{ width: 16, height: 1, backgroundColor: 'var(--color-hairline)' }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-auto" style={{ padding: '24px' }}>
              {/* Step 0: Pick type */}
              {step === 0 && (
                <div>
                  <div className="relative" style={{ maxWidth: 320, marginBottom: '12px' }}>
                    <Search
                      size={14}
                      className="absolute text-ink-subtle"
                      style={{ left: 10, top: 9 }}
                    />
                    <input
                      className="input-field no-drag"
                      style={{ paddingLeft: 32, minHeight: 32 }}
                      placeholder={t('wizard.type_search_hint')}
                      value={typeQuery}
                      onChange={e => setTypeQuery(e.target.value)}
                    />
                    {typeQuery && (
                      <button
                        className="absolute text-ink-subtle hover:text-ink no-drag"
                        style={{
                          right: 6,
                          top: 7,
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 2
                        }}
                        onClick={() => setTypeQuery('')}
                      >
                        <ChevronRight size={14} style={{ transform: 'rotate(45deg)' }} />
                      </button>
                    )}
                  </div>

                  {typesLoading ? (
                    <p className="text-ink-subtle p-lg text-center">{t('common.loading')}</p>
                  ) : types.length === 0 ? (
                    <p className="text-ink-subtle p-lg text-center">{t('cmd.no_results')}</p>
                  ) : (
                    WIZARD_GROUPS.map(group => {
                      // Registry type names are lowercase; the group lists may use
                      // uppercase legacy names — match case-insensitively.
                      const groupTypes = types.filter(tp =>
                        group.types.some(g => g.toLowerCase() === tp.type_name.toLowerCase())
                      )
                      if (groupTypes.length === 0) return null
                      return (
                        <div key={group.key} style={{ marginBottom: '16px' }}>
                          <p
                            className="field-label-strong"
                            style={{ fontSize: 'var(--text-caption-strong)', marginBottom: '4px' }}
                          >
                            {t(`wizard.group_${group.key}`)}
                          </p>
                          <p
                            className="text-ink-subtle"
                            style={{ fontSize: 'var(--text-fine-print)', marginBottom: '8px' }}
                          >
                            {t(`wizard.group_${group.key}_desc`)}
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-3" style={{ gap: '8px' }}>
                            {groupTypes.map(tp => (
                              <button
                                key={tp.type_name}
                                className="card transition-all no-drag"
                                style={{
                                  padding: '10px 12px',
                                  cursor: 'pointer',
                                  border:
                                    selectedType?.type_name === tp.type_name
                                      ? '2px solid var(--color-accent)'
                                      : '1px solid var(--color-hairline)',
                                  minHeight: 60,
                                  textAlign: 'left'
                                }}
                                onClick={() => setSelectedType(tp)}
                              >
                                <p style={{ fontSize: 'var(--text-caption)', fontWeight: 600 }}>
                                  {tp.type_name.replace('DATASET_', '').replace('TREE_', '')}
                                </p>
                                <p
                                  className="text-ink-subtle"
                                  style={{ fontSize: 'var(--text-fine-print)', marginTop: '2px' }}
                                >
                                  {tp.required_columns.join(', ')}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })
                  )}

                  {selectedType && (
                    <div
                      className="rounded-sm"
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--color-accent-surface)'
                      }}
                    >
                      <p style={{ fontSize: 'var(--text-caption)' }}>
                        <strong>{selectedType.type_name}</strong> —{' '}
                        {selectedType.required_columns.join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Step 1: Import data */}
              {step === 1 && (
                <div>
                  <p className="field-label-strong" style={{ marginBottom: '4px' }}>
                    {t('wizard.step2_sub')}
                  </p>
                  <p
                    className="text-ink-subtle"
                    style={{ fontSize: 'var(--text-fine-print)', marginBottom: '12px' }}
                  >
                    {t('wizard.column_info', { columns: columns.join(', ') })}
                  </p>

                  <div style={{ marginBottom: '12px' }}>
                    <div className="flex items-center" style={{ gap: '8px', marginBottom: '8px' }}>
                      <button
                        className="btn-pearl no-drag"
                        style={{ minHeight: 32, fontSize: 'var(--text-fine-print)' }}
                        onClick={async () => {
                          const path = await window.pyitol.files.pickDataFile()
                          if (!path) return
                          const content = await window.pyitol.files.readFile(path)
                          setDataInput(content)
                        }}
                      >
                        <UploadIcon size={12} /> {t('wizard.import_csv')}
                      </button>
                      <button
                        className="btn-pearl no-drag"
                        style={{ minHeight: 32, fontSize: 'var(--text-fine-print)' }}
                        onClick={async () => {
                          const clip = await window.pyitol.clipboard.readText()
                          setDataInput(clip)
                        }}
                      >
                        <ClipboardPaste size={12} /> {t('wizard.paste_sample')}
                      </button>
                    </div>

                    <textarea
                      className="input-field no-drag"
                      style={{
                        minHeight: 200,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-fine-print)',
                        resize: 'vertical'
                      }}
                      placeholder={t('wizard.data_placeholder')}
                      value={dataInput}
                      onChange={e => setDataInput(e.target.value)}
                    />
                  </div>

                  {dataRows.length > 0 && (
                    <div>
                      <p
                        className="text-ink-subtle"
                        style={{ fontSize: 'var(--text-fine-print)', marginBottom: '4px' }}
                      >
                        {t('wizard.data_summary', { rows: dataRows.length, cols: columns.length })}
                      </p>
                      <div
                        className="overflow-auto rounded-sm border border-hairline"
                        style={{ maxHeight: 200 }}
                      >
                        <table
                          className="w-full"
                          style={{ fontSize: 'var(--text-fine-print)', borderCollapse: 'collapse' }}
                        >
                          <thead className="sticky top-0 bg-parchment">
                            <tr>
                              <th
                                className="px-xs py-xxs text-left font-semibold text-ink-muted border-b border-hairline"
                                style={{ width: 32 }}
                              >
                                #
                              </th>
                              {columns.map(col => (
                                <th
                                  key={col}
                                  className="px-xs py-xxs text-left font-semibold text-ink-muted border-b border-hairline"
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {dataRows.slice(0, 50).map((row, i) => (
                              <tr key={i}>
                                <td className="px-xs py-xxs cell-mono text-ink-subtle border-b border-divider-soft">
                                  {i + 1}
                                </td>
                                {columns.map(col => (
                                  <td
                                    key={col}
                                    className="px-xs py-xxs cell-mono border-b border-divider-soft"
                                  >
                                    {row[col] ?? ''}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: '12px' }}>
                    <label className="field-label">{t('wizard.separator')}</label>
                    <select
                      className="input-select no-drag"
                      style={{ maxWidth: 200 }}
                      value={separator}
                      onChange={e => setSeparator(e.target.value)}
                    >
                      <option value="TAB">TAB</option>
                      <option value="COMMA">COMMA</option>
                      <option value="SEMICOLON">SEMICOLON</option>
                      <option value="SPACE">SPACE</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Step 2: Configure parameters */}
              {step === 2 && (
                <div>
                  <p className="field-label-strong" style={{ marginBottom: '4px' }}>
                    {t('wizard.step3_sub')}
                  </p>
                  <p
                    className="text-ink-subtle"
                    style={{ fontSize: 'var(--text-fine-print)', marginBottom: '12px' }}
                  >
                    {t('wizard.params_summary_body')}
                  </p>

                  {/* Label & Color */}
                  {idl && !idl.no_label_color && (
                    <div className="grid grid-cols-2" style={{ gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label className="field-label">{t('wizard.label_label')}</label>
                        <input
                          className="input-field no-drag"
                          type="text"
                          value={label}
                          onChange={e => setLabel(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="field-label">{t('wizard.color_label')}</label>
                        <div className="flex items-center" style={{ gap: '8px' }}>
                          <input
                            type="color"
                            value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#000000'}
                            onChange={e => {
                              setColor(e.target.value.toUpperCase())
                              lastValidColorRef.current = e.target.value.toUpperCase()
                            }}
                            style={{
                              width: 32,
                              height: 32,
                              border: '1px solid var(--color-hairline)',
                              borderRadius: 'var(--radius-xs)',
                              cursor: 'pointer',
                              padding: 2
                            }}
                          />
                          <input
                            className="input-field no-drag"
                            type="text"
                            value={color}
                            onChange={e => setColor(e.target.value)}
                            onBlur={() => {
                              // Reject invalid colours — fall back to the last valid value (P3-12)
                              if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
                                setColor(lastValidColorRef.current)
                              }
                            }}
                            style={{ flex: 1 }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {idlError && (
                    <div
                      className="rounded-sm"
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--color-danger-surface)',
                        marginBottom: '12px'
                      }}
                    >
                      <p style={{ fontSize: 'var(--text-caption)', color: 'var(--color-danger)' }}>
                        {t('inspector.idl_failed')}
                      </p>
                    </div>
                  )}

                  {/* Parameter groups */}
                  {idl &&
                    idl.groups.map(group => (
                      <div key={group.key} style={{ marginBottom: '12px' }}>
                        <p
                          className="field-label-strong"
                          style={{ fontSize: 'var(--text-caption-strong)', marginBottom: '4px' }}
                        >
                          {t(`inspector.group.${group.key}`)}
                        </p>
                        <div className="grid grid-cols-2" style={{ gap: '8px' }}>
                          {group.fields
                            .filter(f => f.key !== 'label' && f.key !== 'color')
                            .map(field => (
                              <div key={field.key}>
                                <IdlWidget
                                  field={field}
                                  value={parameters[field.key] ?? String(field.default)}
                                  onChange={v => setParameters({ ...parameters, [field.key]: v })}
                                  onReset={() => {
                                    const next = { ...parameters }
                                    delete next[field.key]
                                    next[field.key] = String(field.default)
                                    setParameters(next)
                                  }}
                                />
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* Step 3: Preview & Export */}
              {step === 3 && (
                <div className="flex flex-col" style={{ height: '100%' }}>
                  <p className="field-label-strong" style={{ marginBottom: '4px' }}>
                    {t('wizard.step4_sub')}
                  </p>

                  {error && (
                    <div
                      className="rounded-sm"
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--color-danger-surface)',
                        marginBottom: '12px'
                      }}
                    >
                      <p style={{ fontSize: 'var(--text-caption)', color: 'var(--color-danger)' }}>
                        <AlertCircle size={14} className="inline" style={{ marginRight: '4px' }} />
                        {error}
                      </p>
                    </div>
                  )}

                  {previewLoading ? (
                    <p className="text-ink-subtle p-lg text-center">
                      {t('wizard.preview_loading')}
                    </p>
                  ) : previewText ? (
                    <div className="flex-1 overflow-auto rounded-sm border border-hairline">
                      <div
                        className="flex items-center border-b border-hairline"
                        style={{
                          gap: '8px',
                          padding: '4px 12px',
                          backgroundColor: 'var(--color-parchment)'
                        }}
                      >
                        <FileText size={12} className="text-ink-subtle" />
                        <span style={{ fontSize: 'var(--text-fine-print)' }}>
                          {t('wizard.preview_filename')}
                        </span>
                      </div>
                      <pre
                        className="p-sm font-mono overflow-auto"
                        style={{ fontSize: 'var(--text-fine-print)', lineHeight: 1.6, margin: 0 }}
                      >
                        <code
                          dangerouslySetInnerHTML={{ __html: highlightItolTemplate(previewText) }}
                        />
                      </pre>
                    </div>
                  ) : (
                    <p className="text-ink-subtle p-lg text-center">{t('wizard.preview_empty')}</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer — navigation */}
            <div
              className="flex items-center justify-between border-t border-hairline"
              style={{ flexShrink: 0, padding: '0 24px', height: 56 }}
            >
              <button
                className="btn-pearl no-drag"
                onClick={() => (step > 0 ? setStep(step - 1) : setOpen(false))}
              >
                <ChevronLeft size={14} />
                {step > 0 ? t('wizard.back') : t('dialog.close')}
              </button>

              <div className="flex items-center" style={{ gap: '8px' }}>
                {step === 3 && (
                  <button className="btn-pearl no-drag" onClick={handleExport}>
                    <UploadIcon size={14} />
                    {t('wizard.export')}
                  </button>
                )}
                {step < 3 ? (
                  <button
                    className="btn-primary no-drag"
                    disabled={!canNext}
                    onClick={() => setStep(step + 1)}
                  >
                    {t('wizard.next')}
                    <ChevronRight size={14} />
                  </button>
                ) : (
                  <button className="btn-primary no-drag" onClick={handleFinish}>
                    <Check size={14} />
                    {t('wizard.create_unit')}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* Discard confirmation dialog — focus trap + Esc via useDialog; default
          focus stays on "Cancel" so the destructive choice is never accidental */}
      {confirmDiscard && (
        <DiscardConfirm
          onCancel={() => setConfirmDiscard(false)}
          onDiscard={() => {
            setConfirmDiscard(false)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function DiscardConfirm({
  onCancel,
  onDiscard
}: {
  onCancel: () => void
  onDiscard: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const containerRef = useDialog(true, onCancel)
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        className="card flex flex-col"
        style={{ width: 360, padding: 24 }}
      >
        <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, marginBottom: '8px' }}>
          {t('app.unsaved_title')}
        </h3>
        <p
          className="text-ink-muted"
          style={{ fontSize: 'var(--text-caption)', marginBottom: '16px' }}
        >
          {t('app.unsaved_msg')}
        </p>
        <div className="flex items-center justify-end" style={{ gap: '8px' }}>
          <button className="btn-pearl no-drag" autoFocus onClick={onCancel}>
            {t('app.unsaved_cancel')}
          </button>
          <button className="btn-primary no-drag" onClick={onDiscard}>
            {t('app.unsaved_discard')}
          </button>
        </div>
      </div>
    </div>
  )
}
