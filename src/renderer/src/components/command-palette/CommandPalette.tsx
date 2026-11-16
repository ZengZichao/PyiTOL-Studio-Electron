import { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore, useToastStore } from '../../stores/ui'
import { useProjectStore } from '../../stores/project'
import { useDialog } from '../../hooks/useDialog'
import type { TemplateTypeInfo } from '@shared/types'

interface CommandItem {
  id: string
  label: string
  kind: 'unit' | 'type' | 'command'
  section: string
  shortcut?: string
  action: () => void
}

export function CommandPalette(): JSX.Element {
  const { t } = useTranslation()
  const setOpen = useUIStore(s => s.setCommandPaletteOpen)
  const data = useProjectStore(s => s.data)
  const selectUnit = useProjectStore(s => s.selectUnit)
  const removeUnit = useProjectStore(s => s.removeUnit)
  const setWizardOpen = useUIStore(s => s.setWizardOpen)
  const setUploadDialogOpen = useUIStore(s => s.setUploadDialogOpen)
  const setTheme = useUIStore(s => s.setTheme)
  const setLanguage = useUIStore(s => s.setLanguage)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [types, setTypes] = useState<TemplateTypeInfo[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  const containerRef = useDialog(true, () => setOpen(false), { initialFocusRef: inputRef })

  useEffect(() => {
    void window.pyitol.sidecar
      .call<TemplateTypeInfo[]>('list_template_types', {})
      .then(setTypes)
      .catch(err => {
        useToastStore
          .getState()
          .pushToast('error', t('common.error', { error: (err as Error).message }))
      })
  }, [t])

  const items = useMemo<CommandItem[]>(() => {
    const result: CommandItem[] = []

    // Units
    for (const unit of data?.units ?? []) {
      result.push({
        id: `unit:${unit.unit_id}`,
        label: unit.label || unit.type_name,
        kind: 'unit',
        section: t('cmd.section_units'),
        action: () => {
          selectUnit(unit.unit_id)
          setOpen(false)
        }
      })
    }

    // Template types — selecting one opens the wizard with that type pre-selected
    for (const tp of types) {
      result.push({
        id: `type:${tp.type_name}`,
        label: tp.type_name,
        kind: 'type',
        section: t('cmd.section_types'),
        action: () => {
          useUIStore.getState().setWizardPendingType(tp.type_name)
          setWizardOpen(true)
          setOpen(false)
        }
      })
    }

    // Commands
    const commands: Array<[string, () => void, string?]> = [
      [
        t('tb.new'),
        () => window.dispatchEvent(new CustomEvent('menu-command', { detail: 'new-project' })),
        '⌘N'
      ],
      [
        t('tb.open'),
        () => window.dispatchEvent(new CustomEvent('menu-command', { detail: 'open-project' })),
        '⌘O'
      ],
      [
        t('tb.save'),
        () => window.dispatchEvent(new CustomEvent('menu-command', { detail: 'save-project' })),
        '⌘S'
      ],
      [t('tb.wizard'), () => setWizardOpen(true), '⌥⌘W'],
      [t('tb.upload'), () => setUploadDialogOpen(true), '⌘U'],
      [
        t('tb.preview'),
        () => window.dispatchEvent(new CustomEvent('menu-command', { detail: 'generate-preview' })),
        '⌘R'
      ],
      [
        t('tb.export'),
        () => window.dispatchEvent(new CustomEvent('menu-command', { detail: 'export-template' })),
        '⌘E'
      ],
      [
        t('tb.theme') + ': ' + t('theme.light'),
        () => {
          setTheme('light')
          window.pyitol.settings.set('ui/theme', 'light')
        }
      ],
      [
        t('tb.theme') + ': ' + t('theme.dark'),
        () => {
          setTheme('dark')
          window.pyitol.settings.set('ui/theme', 'dark')
        }
      ],
      [
        t('tb.theme') + ': ' + t('theme.system'),
        () => {
          setTheme('system')
          window.pyitol.settings.set('ui/theme', 'system')
        }
      ],
      [
        t('lang.zh'),
        () => {
          setLanguage('zh')
          window.pyitol.settings.set('ui/language', 'zh')
        }
      ],
      [
        t('lang.en'),
        () => {
          setLanguage('en')
          window.pyitol.settings.set('ui/language', 'en')
        }
      ]
    ]

    // Add delete command for each unit — same confirmation as the unit list (P1-5)
    for (const unit of data?.units ?? []) {
      commands.push([
        `${t('ctx.delete_unit')}: ${unit.label || unit.type_name}`,
        () => {
          if (window.confirm(t('ctx.delete_confirm', { name: unit.label || unit.type_name }))) {
            removeUnit(unit.unit_id)
          }
          setOpen(false)
        }
      ])
    }

    for (const [label, action, shortcut] of commands) {
      result.push({
        id: `cmd:${label}`,
        label,
        kind: 'command',
        section: t('cmd.section_commands'),
        shortcut,
        action: () => {
          action()
          setOpen(false)
        }
      })
    }

    return result
  }, [
    data,
    types,
    t,
    selectUnit,
    setOpen,
    setWizardOpen,
    setUploadDialogOpen,
    setTheme,
    setLanguage,
    removeUnit
  ])

  const filtered = useMemo(() => {
    if (!query) return items
    const q = query.toLowerCase()
    return items.filter(item => item.label.toLowerCase().includes(q))
  }, [items, query])

  // Group filtered items by section
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {}
    for (const item of filtered) {
      if (!groups[item.section]) groups[item.section] = []
      groups[item.section].push(item)
    }
    return groups
  }, [filtered])

  // Flatten for keyboard navigation
  const flatItems = useMemo(() => {
    return Object.values(grouped).flat()
  }, [grouped])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const selected = container.querySelector('[data-selected="true"]') as HTMLElement | null
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      flatItems[selectedIndex]?.action()
    }
  }

  let runningIndex = -1

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-start justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)', paddingTop: '48px' }}
        onClick={() => setOpen(false)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label={t('cmd.placeholder')}
          tabIndex={-1}
          className="card w-full no-drag"
          style={{ maxWidth: 600, padding: 0, boxShadow: 'var(--shadow-3)' }}
          onClick={e => e.stopPropagation()}
          initial={{ scale: 0.95, y: -20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: -20, opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="flex items-center"
            style={{
              gap: '8px',
              padding: '0 12px',
              borderBottom: '1px solid var(--color-hairline)'
            }}
          >
            <Search size={16} className="text-ink-subtle" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent outline-none"
              style={{ fontSize: 'var(--text-body)', height: 44 }}
              placeholder={t('cmd.placeholder')}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              role="combobox"
              aria-expanded="true"
              aria-controls="cmd-listbox"
              aria-activedescendant={
                flatItems[selectedIndex] ? `cmd-item-${selectedIndex}` : undefined
              }
            />
          </div>
          <div
            ref={listRef}
            id="cmd-listbox"
            role="listbox"
            className="overflow-auto"
            style={{ maxHeight: 384 }}
          >
            {flatItems.length === 0 && (
              <p className="p-sm text-ink-subtle" style={{ fontSize: 'var(--text-caption)' }}>
                {t('cmd.no_results')}
              </p>
            )}
            {Object.entries(grouped).map(([section, sectionItems]) => (
              <div key={section} role="group" aria-label={section}>
                <div
                  className="px-sm py-xxs text-ink-subtle"
                  style={{
                    fontSize: 'var(--text-micro)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    backgroundColor: 'var(--color-parchment)'
                  }}
                >
                  {section}
                </div>
                {sectionItems.map(item => {
                  runningIndex++
                  const idx = runningIndex
                  const isSelected = idx === selectedIndex
                  return (
                    <button
                      key={item.id}
                      id={`cmd-item-${idx}`}
                      role="option"
                      aria-selected={isSelected}
                      data-selected={isSelected}
                      className="flex w-full items-center justify-between no-drag transition-colors"
                      style={{
                        height: 36,
                        padding: '0 12px',
                        backgroundColor: isSelected
                          ? 'var(--color-surface-selected)'
                          : 'transparent'
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => item.action()}
                    >
                      <div className="flex items-center" style={{ gap: '8px' }}>
                        <span
                          className="inline-block rounded-full"
                          style={{
                            width: 6,
                            height: 6,
                            backgroundColor:
                              item.kind === 'unit'
                                ? 'var(--color-accent)'
                                : item.kind === 'type'
                                  ? 'var(--color-warning)'
                                  : 'var(--color-ink-subtle)'
                          }}
                        />
                        <span style={{ fontSize: 'var(--text-caption)' }}>{item.label}</span>
                      </div>
                      <div className="flex items-center" style={{ gap: '8px' }}>
                        {item.shortcut && (
                          <kbd
                            className="text-ink-subtle"
                            style={{
                              fontSize: 'var(--text-micro)',
                              padding: '2px 6px',
                              border: '1px solid var(--color-hairline)',
                              borderRadius: 'var(--radius-xs)',
                              fontFamily: 'var(--font-mono)'
                            }}
                          >
                            {item.shortcut}
                          </kbd>
                        )}
                        <span
                          className="text-ink-subtle"
                          style={{ fontSize: 'var(--text-fine-print)' }}
                        >
                          {t(`cmd.kind_${item.kind}`)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
