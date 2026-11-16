import { useTranslation } from 'react-i18next'
import type { FieldSpec } from '@shared/types'
import { Plus, X, RotateCcw } from 'lucide-react'
import { useId } from 'react'

interface IdlWidgetProps {
  field: FieldSpec
  value: string
  onChange: (value: string) => void
  onReset?: () => void
}

/**
 * Render a single form field based on its IDL widget type.
 * All form labels use htmlFor/id association for accessibility.
 * Switch uses role="switch" + aria-checked.
 */
export function IdlWidget({ field, value, onChange, onReset }: IdlWidgetProps): JSX.Element {
  const { t } = useTranslation()
  const fieldId = useId()

  const labelEl = (
    <div className="flex items-center justify-between">
      <label className="field-label" htmlFor={fieldId}>
        {field.label}
      </label>
      <div className="flex items-center" style={{ gap: '4px' }}>
        {field.hint && (
          <span
            className="text-ink-subtle"
            style={{ fontSize: 'var(--text-fine-print)' }}
            title={field.hint}
          >
            {field.hint}
          </span>
        )}
        {onReset && (
          <button
            className="text-ink-subtle hover:text-ink transition-colors no-drag"
            style={{
              padding: '2px',
              minHeight: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer'
            }}
            title={t('inspector.field_default_tip', { field: field.label })}
            onClick={onReset}
          >
            <RotateCcw size={11} />
          </button>
        )}
      </div>
    </div>
  )

  switch (field.widget) {
    case 'bool': {
      const checked = value === 'true' || value === '1' || value === 'yes'
      const switchId = fieldId
      return (
        <div className="flex flex-col" style={{ gap: '4px' }}>
          {labelEl}
          <button
            id={switchId}
            role="switch"
            aria-checked={checked}
            aria-label={field.label}
            className="relative transition-colors no-drag"
            style={{
              width: 40,
              height: 24,
              borderRadius: '9999px',
              backgroundColor: checked ? 'var(--color-accent)' : 'var(--color-surface-chip)',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease'
            }}
            onClick={() => onChange(checked ? 'false' : 'true')}
          >
            <span
              className="absolute rounded-full bg-white transition-transform"
              style={{
                width: 18,
                height: 18,
                top: 3,
                left: checked ? 19 : 3,
                transition: 'left 0.2s ease'
              }}
            />
          </button>
        </div>
      )
    }

    case 'int':
      return (
        <div className="flex flex-col" style={{ gap: '4px' }}>
          {labelEl}
          <input
            id={fieldId}
            className="input-field"
            type="number"
            step={1}
            min={field.minimum}
            max={field.maximum}
            value={value}
            onChange={e => onChange(e.target.value)}
          />
        </div>
      )

    case 'float':
      return (
        <div className="flex flex-col" style={{ gap: '4px' }}>
          {labelEl}
          <input
            id={fieldId}
            className="input-field"
            type="number"
            step="any"
            min={field.minimum}
            max={field.maximum}
            value={value}
            onChange={e => onChange(e.target.value)}
          />
          {field.unit && (
            <span className="text-ink-subtle" style={{ fontSize: 'var(--text-fine-print)' }}>
              {t(`inspector.unit.${field.unit}`, { defaultValue: field.unit })}
            </span>
          )}
        </div>
      )

    case 'color':
      return (
        <div className="flex flex-col" style={{ gap: '4px' }}>
          {labelEl}
          <div className="flex items-center" style={{ gap: '8px' }}>
            <input
              id={fieldId}
              type="color"
              value={value.startsWith('#') ? value : '#000000'}
              onChange={e => onChange(e.target.value.toUpperCase())}
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
              className="input-field"
              type="text"
              value={value}
              onChange={e => onChange(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
        </div>
      )

    case 'choice':
      return (
        <div className="flex flex-col" style={{ gap: '4px' }}>
          {labelEl}
          <select
            id={fieldId}
            className="input-select"
            value={value}
            onChange={e => onChange(e.target.value)}
          >
            {field.choices?.map((choice, i) => (
              <option key={choice} value={choice}>
                {field.choice_labels?.[i] ?? choice}
              </option>
            ))}
          </select>
        </div>
      )

    case 'color_list': {
      const sep = field.range === 'comma' ? ',' : ' '
      const colors = value ? value.split(field.range === 'comma' ? ',' : /\s+/).filter(Boolean) : []
      return (
        <div className="flex flex-col" style={{ gap: '4px' }}>
          {labelEl}
          <div className="flex flex-col" style={{ gap: '4px' }}>
            {colors.map((color, i) => (
              <div key={i} className="flex items-center" style={{ gap: '8px' }}>
                <input
                  type="color"
                  value={color.startsWith('#') ? color : '#000000'}
                  onChange={e => {
                    const next = [...colors]
                    next[i] = e.target.value.toUpperCase()
                    onChange(next.join(sep))
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
                  className="input-field"
                  type="text"
                  value={color}
                  onChange={e => {
                    const next = [...colors]
                    next[i] = e.target.value
                    onChange(next.join(sep))
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  className="text-ink-subtle hover:text-ink no-drag"
                  style={{
                    padding: '4px',
                    minHeight: 'auto',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    const next = colors.filter((_, j) => j !== i)
                    onChange(next.join(sep))
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              className="btn-pearl no-drag"
              style={{ minHeight: 32, fontSize: 'var(--text-fine-print)' }}
              onClick={() => onChange([...colors, '#FFFFFF'].join(sep))}
            >
              <Plus size={12} /> {t('inspector.list_add')}
            </button>
          </div>
        </div>
      )
    }

    case 'text_list': {
      const sep = field.range === 'comma' ? ',' : '\n'
      const items = value ? value.split(field.range === 'comma' ? ',' : /\n/).filter(Boolean) : []
      return (
        <div className="flex flex-col" style={{ gap: '4px' }}>
          {labelEl}
          <div className="flex flex-col" style={{ gap: '4px' }}>
            {items.map((item, i) => (
              <div key={i} className="flex items-center" style={{ gap: '8px' }}>
                <input
                  className="input-field"
                  type="text"
                  value={item}
                  onChange={e => {
                    const next = [...items]
                    next[i] = e.target.value
                    onChange(next.join(sep))
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  className="text-ink-subtle hover:text-ink no-drag"
                  style={{
                    padding: '4px',
                    minHeight: 'auto',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    const next = items.filter((_, j) => j !== i)
                    onChange(next.join(sep))
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              className="btn-pearl no-drag"
              style={{ minHeight: 32, fontSize: 'var(--text-fine-print)' }}
              onClick={() => onChange([...items, ''].join(sep))}
            >
              <Plus size={12} /> {t('inspector.list_add')}
            </button>
          </div>
        </div>
      )
    }

    default:
      // text
      return (
        <div className="flex flex-col" style={{ gap: '4px' }}>
          {labelEl}
          <input
            id={fieldId}
            className="input-field"
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
          />
        </div>
      )
  }
}
