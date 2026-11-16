import type { FieldSpec } from '@shared/types'

export interface ValidationError {
  fieldKey: string
  fieldLabel: string
  message: string
}

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/

/**
 * Validate a single field value against its spec.
 */
export function validateField(field: FieldSpec, value: string): string | null {
  const v = value.trim()

  if (field.required && !v) {
    return 'required'
  }

  switch (field.widget) {
    case 'int': {
      if (!v) return null
      const n = Number(v)
      if (!Number.isInteger(n)) return 'number'
      if (field.minimum !== undefined && n < field.minimum) return 'range'
      if (field.maximum !== undefined && n > field.maximum) return 'range'
      return null
    }
    case 'float': {
      if (!v) return null
      const n = Number(v)
      if (isNaN(n)) return 'number'
      if (field.minimum !== undefined && n < field.minimum) return 'range'
      if (field.maximum !== undefined && n > field.maximum) return 'range'
      return null
    }
    case 'color': {
      if (!v) return null
      if (!COLOR_RE.test(v)) return 'color'
      return null
    }
    case 'color_list': {
      if (!v) return null
      // Split with the same delimiter the widget uses to write the value back
      // (comma-separated fields use commas, others use whitespace) — P2-5.
      const parts = (field.range === 'comma' ? v.split(',') : v.split(/\s+/))
        .map(s => s.trim())
        .filter(Boolean)
      for (const part of parts) {
        if (!COLOR_RE.test(part)) return 'color_list'
      }
      return null
    }
    default:
      return null
  }
}

/**
 * Validate all fields of an IDL. Returns a map of fieldKey → error code.
 */
export function validateAllFields(
  fields: FieldSpec[],
  parameters: Record<string, string>
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of fields) {
    const value = parameters[field.key] ?? String(field.default)
    const err = validateField(field, value)
    if (err) errors[field.key] = err
  }
  return errors
}
