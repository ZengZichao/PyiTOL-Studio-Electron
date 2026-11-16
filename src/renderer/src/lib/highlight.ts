/**
 * Lightweight iTOL template syntax highlighter.
 * iTOL templates use a simple key-value format:
 *   DATASET_TYPE
 *   SEPARATOR TAB
 *   DATASET_LABEL my label
 *   COLOR #ff0000
 *   FIELD_KEY value
 *   DATA
 *   actual\tdata\trows
 *
 * This function returns HTML with spans for syntax classes.
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const HEADER_KEYWORDS = new Set([
  'DATASET_BINARY',
  'DATASET_GRADIENT',
  'DATASET_HEATMAP',
  'DATASET_COLORSTRIP',
  'DATASET_COLORSQUARE',
  'DATASET_TEXT',
  'DATASET_SYMBOL',
  'DATASET_EXTERNALSHAPE',
  'DATASET_DOMAINS',
  'DATASET_SIMPLEBAR',
  'DATASET_MULTIBAR',
  'DATASET_BOXPLOT',
  'DATASET_LINECHART',
  'DATASET_PIECHART',
  'DATASET_CONNECTOR',
  'DATASET_IMAGE',
  'DATASET_PRIMITIVE',
  'DATASET_BRANCH_COLORS',
  'DATASET_LABELS',
  'DATASET_BACKBONE',
  'DATASET_CDS',
  'DATASET_TRACK',
  'DATASET_ALIGN',
  'DATASET_DOT',
  'DATASET_RINGDATA',
  'TREE_COLORS',
  'DATASET_STYLE',
  'DATASET_PRIVATE',
  'TREE_LAYOUT',
  'DATASET_HIDDEN_BRANCHES',
  'DATASET_DECORATION'
])

const SECTION_KEYWORDS = new Set([
  'DATA',
  'LEGEND_TITLE',
  'LEGEND_SHAPES',
  'LEGEND_COLORS',
  'LEGEND_LABELS'
])

/**
 * Highlight a single line of iTOL template text.
 */
function highlightLine(line: string): string {
  const escaped = escapeHtml(line)

  // Empty line
  if (!escaped.trim()) return escaped

  // Comment
  if (escaped.startsWith('#')) {
    return `<span class="hl-comment">${escaped}</span>`
  }

  // Check if the first word is a header keyword
  const firstWord = escaped.split(/\s/)[0]
  if (HEADER_KEYWORDS.has(firstWord)) {
    return `<span class="hl-header">${escaped}</span>`
  }

  if (SECTION_KEYWORDS.has(firstWord)) {
    return `<span class="hl-section">${escaped}</span>`
  }

  // Key-value pairs: KEY VALUE
  const match = escaped.match(/^(\w+)(\s+.*)?$/)
  if (match) {
    const key = match[1]
    const rest = match[2] ?? ''
    // Color value
    if (key === 'COLOR' || key === 'LEGEND_COLORS') {
      return `<span class="hl-key">${key}</span><span class="hl-value-color">${rest}</span>`
    }
    return `<span class="hl-key">${key}</span><span class="hl-value">${rest}</span>`
  }

  // Data line (contains tabs or is in the DATA section)
  return `<span class="hl-data">${escaped}</span>`
}

/**
 * Highlight an entire iTOL template text block.
 */
export function highlightItolTemplate(text: string): string {
  return text.split('\n').map(highlightLine).join('\n')
}
