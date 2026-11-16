import { useTranslation } from 'react-i18next'
import { useUIStore, useToastStore } from '../../stores/ui'
import { useProjectStore, unitToSpec } from '../../stores/project'
import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload as UploadIcon,
  FolderOpen,
  Check,
  AlertCircle,
  X,
  ExternalLink,
  Loader2
} from 'lucide-react'
import type { UploadResult } from '@shared/types'
import { useDialog } from '../../hooks/useDialog'

type UploadState = 'idle' | 'running' | 'success' | 'error'

export function UploadDialog(): JSX.Element {
  const { t } = useTranslation()
  const setOpen = useUIStore(s => s.setUploadDialogOpen)
  const data = useProjectStore(s => s.data)

  const [apiKey, setApiKey] = useState('')
  const [treePath, setTreePath] = useState(data?.tree_path ?? '')
  const [outputDir, setOutputDir] = useState('')
  const [format, setFormat] = useState('svg')
  const [force, setForce] = useState(false)
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set())
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState<{ msg: string; percent?: number } | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)

  const containerRef = useDialog(true, () => {
    if (state !== 'running') setOpen(false)
  })

  const handlePickTree = useCallback(async () => {
    const path = await window.pyitol.files.pickTreeFile()
    if (path) setTreePath(path)
  }, [])

  const handlePickOutput = useCallback(async () => {
    const path = await window.pyitol.files.pickDirectory()
    if (path) setOutputDir(path)
  }, [])

  const toggleUnit = useCallback((unitId: string) => {
    setSelectedUnits(prev => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    const units = data?.units ?? []
    if (selectedUnits.size === units.length) {
      setSelectedUnits(new Set())
    } else {
      setSelectedUnits(new Set(units.map(u => u.unit_id)))
    }
  }, [data?.units, selectedUnits.size])

  const handleUpload = useCallback(async () => {
    setError('')
    setResult(null)
    setState('running')
    setProgress({ msg: t('upload.running') })

    const ac = new AbortController()
    abortRef.current = ac
    cancelledRef.current = false
    let keyPath: string | null = null

    try {
      // Export selected units to temp template files using os.tmpdir()
      const tmpDir = window.pyitol.files.getTempDir()
      const templateFiles: string[] = []
      const units = data?.units ?? []
      const toExport = units.filter(u => selectedUnits.has(u.unit_id))
      let exportFailures = 0

      for (const unit of toExport) {
        const tempPath = window.pyitol.files.joinPath(
          tmpDir,
          `pyitol_template_${unit.unit_id}_${Date.now()}.txt`
        )
        try {
          await window.pyitol.sidecar.call('export_template_file', {
            unit: unitToSpec(unit),
            path: tempPath
          })
          templateFiles.push(tempPath)
        } catch (err) {
          exportFailures++
          console.error('[upload] template export failed:', unit.unit_id, err)
        }
      }
      if (exportFailures > 0) {
        useToastStore
          .getState()
          .pushToast('error', t('app.status_upload_export_failed', { arg: String(exportFailures) }))
      }

      // Write API key to a temp file in the system temp dir (deleted in finally)
      if (apiKey) {
        keyPath = window.pyitol.files.joinPath(tmpDir, `pyitol_api_key_${Date.now()}.txt`)
        await window.pyitol.files.writeFile(keyPath, apiKey)
      }

      const result = await window.pyitol.upload.run(
        {
          tree_file: treePath,
          template_files: templateFiles,
          output_dir: outputDir || tmpDir,
          fmt: format,
          api_key_file: keyPath,
          project_name: data?.name ?? null,
          force
        },
        (msg, percent) => {
          setProgress({ msg, percent })
        },
        ac.signal
      )

      setResult(result)
      setState('success')
    } catch (err) {
      // User cancelled — the engine-side upload may still finish in the background;
      // stay silent instead of flipping to an error state (P1-4).
      if (cancelledRef.current) return
      setError((err as Error).message)
      setState('error')
    } finally {
      abortRef.current = null
      // Always remove the plaintext key file — success OR failure path (P1-7)
      if (keyPath) {
        try {
          await window.pyitol.files.deleteFile(keyPath)
        } catch {
          // best effort cleanup
        }
      }
    }
  }, [apiKey, treePath, outputDir, format, force, data, selectedUnits, t])

  const handleCancel = useCallback(() => {
    // True engine-level abort isn't available — the request keeps running in
    // the background but its result is discarded and the UI says so.
    cancelledRef.current = true
    abortRef.current?.abort()
    setState('idle')
    setProgress(null)
    useToastStore.getState().pushToast('info', t('upload.cancel_note'))
  }, [t])

  const handleClose = useCallback(() => {
    if (state === 'running') return
    setOpen(false)
  }, [state, setOpen])

  const itolUrl = result ? `https://itol.embl.de/tree/${result.tree_id}` : ''

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={handleClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-title"
          tabIndex={-1}
          className="card flex flex-col no-drag"
          style={{ width: '90%', maxWidth: 560, maxHeight: '90vh', padding: 0 }}
          onClick={e => e.stopPropagation()}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between border-b border-hairline"
            style={{ flexShrink: 0, padding: '0 24px', height: 56 }}
          >
            <h2 id="upload-title" style={{ fontSize: 'var(--text-tagline)', fontWeight: 600 }}>
              {t('upload.title')}
            </h2>
            <button
              className="text-ink-subtle hover:text-ink no-drag"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              onClick={handleClose}
              aria-label={t('dialog.close')}
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto" style={{ padding: '24px' }}>
            {state === 'success' && result ? (
              // Success view
              <div
                className="flex flex-col items-center text-center"
                style={{ paddingTop: '16px', paddingBottom: '16px' }}
              >
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 48,
                    height: 48,
                    backgroundColor: 'var(--color-accent-surface)',
                    color: 'var(--color-accent)',
                    marginBottom: '12px'
                  }}
                >
                  <Check size={28} />
                </div>
                <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600 }}>
                  {t('upload.success')}
                </h3>
                <p className="mt-xs text-ink-muted" style={{ fontSize: 'var(--text-caption)' }}>
                  {t('upload.success_tree_id', { treeId: result.tree_id })}
                </p>
                <div className="flex items-center" style={{ gap: '8px', marginTop: '12px' }}>
                  <button
                    className="btn-pearl no-drag"
                    onClick={() => window.pyitol.platform.openExternal(itolUrl)}
                  >
                    <ExternalLink size={14} />
                    {t('upload.success_url')}
                  </button>
                  <button
                    className="btn-pearl no-drag"
                    onClick={async () => {
                      await window.pyitol.clipboard.writeText(itolUrl)
                    }}
                  >
                    {t('upload.copy_link')}
                  </button>
                </div>
                {Object.keys(result.files).length > 0 && (
                  <div className="mt-sm w-full text-left">
                    <p className="field-label" style={{ marginBottom: '4px' }}>
                      {t('upload.output_files')}
                    </p>
                    {Object.entries(result.files).map(([name, path]) => (
                      <button
                        key={name}
                        className="flex w-full items-center no-drag hover:bg-surface-selected rounded-sm transition-colors"
                        style={{
                          gap: '8px',
                          padding: '4px 12px',
                          fontSize: 'var(--text-fine-print)'
                        }}
                        onClick={() => window.pyitol.platform.showInFolder(path)}
                      >
                        <FolderOpen size={12} className="text-ink-subtle" />
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // Form view
              <div className="flex flex-col" style={{ gap: '12px' }}>
                {/* API Key */}
                <div>
                  <label className="field-label">{t('upload.key_label')}</label>
                  <input
                    className="input-field no-drag"
                    type="password"
                    placeholder={t('upload.key_placeholder')}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                  />
                  <p
                    className="text-ink-subtle"
                    style={{ fontSize: 'var(--text-fine-print)', marginTop: '4px' }}
                  >
                    {t('upload.key_hint_v2')}
                  </p>
                </div>

                {/* Tree file */}
                <div>
                  <label className="field-label">{t('upload.tree_label')}</label>
                  <div className="flex items-center" style={{ gap: '8px' }}>
                    <input
                      className="input-field no-drag"
                      type="text"
                      value={treePath}
                      onChange={e => setTreePath(e.target.value)}
                      placeholder={t('upload.select_tree')}
                      readOnly
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn-pearl no-drag"
                      style={{ flexShrink: 0 }}
                      onClick={handlePickTree}
                    >
                      <FolderOpen size={14} />
                      {t('upload.browse')}
                    </button>
                  </div>
                </div>

                {/* Output directory */}
                <div>
                  <label className="field-label">{t('upload.output_label')}</label>
                  <div className="flex items-center" style={{ gap: '8px' }}>
                    <input
                      className="input-field no-drag"
                      type="text"
                      value={outputDir}
                      onChange={e => setOutputDir(e.target.value)}
                      placeholder={t('upload.output_placeholder')}
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn-pearl no-drag"
                      style={{ flexShrink: 0 }}
                      onClick={handlePickOutput}
                    >
                      <FolderOpen size={14} />
                      {t('upload.browse')}
                    </button>
                  </div>
                </div>

                {/* Format + Force */}
                <div className="grid grid-cols-2" style={{ gap: '12px' }}>
                  <div>
                    <label className="field-label">{t('upload.format_label')}</label>
                    <select
                      className="input-select no-drag"
                      value={format}
                      onChange={e => setFormat(e.target.value)}
                    >
                      <option value="svg">SVG</option>
                      <option value="png">PNG</option>
                      <option value="pdf">PDF</option>
                      <option value="nwk">Newick</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label
                      className="flex items-center no-drag"
                      style={{ gap: '8px', fontSize: 'var(--text-caption)', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={force}
                        onChange={e => setForce(e.target.checked)}
                        style={{ width: 16, height: 16 }}
                      />
                      {t('upload.force')}
                    </label>
                  </div>
                </div>

                {/* Unit selection */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="field-label">{t('upload.templates_label')}</label>
                    {(data?.units ?? []).length > 0 && (
                      <button
                        className="text-link no-drag"
                        style={{ fontSize: 'var(--text-fine-print)' }}
                        onClick={toggleAll}
                      >
                        {selectedUnits.size === (data?.units ?? []).length
                          ? t('common.deselect_all')
                          : t('common.select_all')}
                      </button>
                    )}
                  </div>
                  <div
                    className="flex flex-col"
                    style={{ gap: '4px', marginTop: '8px', maxHeight: 120, overflowY: 'auto' }}
                  >
                    {(data?.units ?? []).map(unit => (
                      <label
                        key={unit.unit_id}
                        className="flex items-center no-drag rounded-sm hover:bg-surface-selected transition-colors"
                        style={{
                          gap: '8px',
                          padding: '4px 12px',
                          fontSize: 'var(--text-caption)',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedUnits.has(unit.unit_id)}
                          onChange={() => toggleUnit(unit.unit_id)}
                          style={{ width: 16, height: 16 }}
                        />
                        <span
                          className="inline-block rounded-full"
                          style={{ width: 8, height: 8, backgroundColor: unit.color }}
                        />
                        {unit.label || unit.type_name}
                        <span
                          className="text-ink-subtle"
                          style={{ fontSize: 'var(--text-fine-print)' }}
                        >
                          {t('unit.row_count_wrap', { count: unit.data_rows.length })}
                        </span>
                      </label>
                    ))}
                    {(data?.units ?? []).length === 0 ? (
                      <p
                        className="text-ink-subtle"
                        style={{ padding: '4px 8px', fontSize: 'var(--text-fine-print)' }}
                      >
                        {t('upload.no_units_msg')}
                      </p>
                    ) : selectedUnits.size === 0 ? (
                      <p
                        className="text-ink-subtle"
                        style={{ padding: '4px 8px', fontSize: 'var(--text-fine-print)' }}
                      >
                        {t('upload.no_units_selected')}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Error message */}
                {state === 'error' && error && (
                  <div
                    className="rounded-sm"
                    style={{ padding: '8px 12px', backgroundColor: 'var(--color-danger-surface)' }}
                    role="alert"
                  >
                    <p style={{ fontSize: 'var(--text-caption)', color: 'var(--color-danger)' }}>
                      <AlertCircle size={14} className="inline" style={{ marginRight: '4px' }} />
                      {t('upload.failed', { error })}
                    </p>
                  </div>
                )}

                {/* Progress */}
                {state === 'running' && progress && (
                  <div
                    className="rounded-sm"
                    style={{ padding: '8px 12px', backgroundColor: 'var(--color-accent-surface)' }}
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex items-center" style={{ gap: '8px' }}>
                      <Loader2 size={14} className="animate-spin text-accent" />
                      <span style={{ fontSize: 'var(--text-caption)' }}>
                        {progress.percent !== undefined
                          ? t('upload.progress', {
                              message: progress.msg,
                              percent: progress.percent
                            })
                          : progress.msg}
                      </span>
                    </div>
                    {progress.percent !== undefined && (
                      <div
                        className="mt-xs h-1 rounded-full overflow-hidden"
                        style={{ backgroundColor: 'var(--color-hairline)' }}
                      >
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${progress.percent}%`,
                            backgroundColor: 'var(--color-accent)'
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end border-t border-hairline no-drag"
            style={{ flexShrink: 0, gap: '8px', padding: '0 24px', height: 56 }}
          >
            {state === 'success' ? (
              <button className="btn-primary no-drag" onClick={handleClose}>
                <Check size={14} />
                {t('dialog.ok')}
              </button>
            ) : state === 'running' ? (
              <button className="btn-pearl no-drag" onClick={handleCancel}>
                <X size={14} />
                {t('upload.cancel')}
              </button>
            ) : (
              <>
                <button className="btn-pearl no-drag" onClick={handleClose}>
                  {t('dialog.close')}
                </button>
                <button className="btn-primary no-drag" disabled={!treePath} onClick={handleUpload}>
                  <UploadIcon size={14} />
                  {t('upload.run')}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
