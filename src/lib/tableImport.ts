// Import from a list: read a CSV or TSV list, give each column a use, and build the `table` of a
// staging job (aruna api/src/routes/staging.rs, core/src/structs/execution/table.rs). The size,
// checksum and modified-time uses follow the planned `rows.size`, `rows.checksums` and
// `rows.modified` fields (plans/ncbi-summary-import.md), which the server does not take yet.
import Papa from 'papaparse'

export type TableHeader = 'first_row' | 'last_comment' | { row: number } | { columns: string[] }

export interface TableFormat {
  delimiter: string
  /** `null` reads quote characters as plain text. */
  quote: string | null
  header: TableHeader
  comment: string | null
  nulls: string[]
  /** `null` decides by a `.gz` name or the gzip magic bytes. */
  gzip: boolean | null
}

export type TableSource = { connector: string } | { object: { bucket: string; key: string } }

export type ChecksumAlgorithm = 'md5' | 'sha256' | 'sha1'

export type ColumnUse =
  | 'path' | 'name' | 'size' | 'checksum' | 'modified'
  | 'search' | 'filter' | 'search_filter' | 'keep' | 'skip'

export interface ColumnChoice {
  name: string
  use: ColumnUse
  /** For a checksum column. */
  algorithm?: ChecksumAlgorithm
  /** "Only rows with": the row is imported when its value is one of these; empty means any. */
  only: string[]
}

export interface TableRows {
  kind: 'file' | 'folder'
  source: string
  target: string
  filter: { column: string; any_of: string[] }[]
  keep: string[] | null
  text: string[]
  exact: string[]
  size?: string
  checksums?: { algorithm: ChecksumAlgorithm; column: string }[]
  modified?: string
}

export interface TableImport {
  source: TableSource
  format: TableFormat
  rows: TableRows
  rate?: number
}

export const DEFAULT_FORMAT: TableFormat = { delimiter: ',', quote: '"', header: 'first_row', comment: null, nulls: [''], gzip: null }

export interface Preview {
  columns: string[]
  rows: string[][]
}

/** A format guessed from the start of the list: separator, header line and gzip by name. */
export function guessFormat(text: string, name = ''): TableFormat {
  const lines = text.split(/\r?\n/).slice(0, 20)
  const data = lines.filter((line) => line && !line.startsWith('#'))
  const count = (sep: string) => Math.min(...data.slice(0, 5).map((line) => line.split(sep).length - 1))
  const delimiter = ['\t', ',', ';'].map((sep) => [sep, data.length ? count(sep) : 0] as const).sort((a, b) => b[1] - a[1])[0]
  const sep = delimiter[1] > 0 ? delimiter[0] : ','
  const comments = lines.filter((line) => line.startsWith('#'))
  const last = comments.at(-1)?.replace(/^#\s*/, '') ?? ''
  const fields = data[0]?.split(sep).length ?? 0
  const lastComment = comments.length > 0 && last.split(sep).length === fields && fields > 1
  return {
    ...DEFAULT_FORMAT,
    delimiter: sep,
    comment: comments.length ? '#' : null,
    header: lastComment ? 'last_comment' : 'first_row',
    nulls: data.some((line) => line.split(sep).includes('na')) ? ['na', ''] : [''],
    gzip: /\.gz$/i.test(name) ? true : null,
  }
}

/** Column names and data rows of the start of a list, read as the server would read it. */
export function previewOf(text: string, format: TableFormat): Preview {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const comment = format.comment
  const commentLines = comment ? lines.filter((line) => line.startsWith(comment)) : []
  const body = comment ? lines.filter((line) => !line.startsWith(comment)) : lines
  const parsed = Papa.parse<string[]>(body.join('\n'), {
    delimiter: format.delimiter,
    quoteChar: format.quote ?? '\u0000',
    skipEmptyLines: true,
  }).data
  const header = format.header
  if (header === 'last_comment') {
    const line = (commentLines.at(-1) ?? '').slice(1).trim()
    return { columns: line.split(format.delimiter).map((name) => name.trim()), rows: parsed }
  }
  if (header === 'first_row') return { columns: parsed[0] ?? [], rows: parsed.slice(1) }
  if ('row' in header) return { columns: parsed[header.row - 1] ?? [], rows: parsed.slice(header.row) }
  return { columns: header.columns, rows: parsed }
}

const HEX = (length: number) => new RegExp(`^[0-9a-f]{${length}}$`, 'i')

/** A first use for each column from its name and first value; the person may change any of them. */
export function guessUses(columns: readonly string[], first: readonly string[]): ColumnChoice[] {
  let pathTaken = false
  let nameTaken = false
  return columns.map((name, index) => {
    const value = first[index] ?? ''
    const lower = name.toLowerCase()
    const choice = (use: ColumnUse, extra: Partial<ColumnChoice> = {}): ColumnChoice => ({ name, use, only: [], ...extra })
    if (!pathTaken && (/^(https?|s3|ftp):\/\//i.test(value) || /(^|_)(url|path|link)$/.test(lower))) {
      pathTaken = true
      return choice('path')
    }
    if (HEX(32).test(value) || lower === 'md5') return choice('checksum', { algorithm: 'md5' })
    if (HEX(64).test(value) || lower.startsWith('sha256')) return choice('checksum', { algorithm: 'sha256' })
    if (HEX(40).test(value) || lower.startsWith('sha1')) return choice('checksum', { algorithm: 'sha1' })
    if (/^(size|bytes|length|file_size)$/.test(lower) && /^\d+$/.test(value)) return choice('size')
    if (/(modified|date|time|collected)/.test(lower) && !Number.isNaN(Date.parse(value))) return choice('modified')
    if (!nameTaken && /^(sample|name|id|sample_id)$/.test(lower)) {
      nameTaken = true
      return choice('name')
    }
    return choice('keep')
  })
}

/** The "from" and "saved as" templates the uses give; null when no column is the path or link. */
export function defaultTemplates(choices: readonly ColumnChoice[]): { source: string; target: string } | null {
  const path = choices.find((choice) => choice.use === 'path')
  if (!path) return null
  const name = choices.find((choice) => choice.use === 'name')
  const file = `{${path.name}|basename}`
  return { source: `{${path.name}}`, target: name ? `{${name.name}}/${file}` : file }
}

/** A template filled with one row: `{column}` and `{column|basename}`; null when a value is missing. */
export function fillTemplate(template: string, columns: readonly string[], row: readonly string[], nulls: readonly string[] = ['']): string | null {
  let missing = false
  const filled = template.replace(/\{([^}|]+)(\|basename)?\}/g, (_, column: string, basename?: string) => {
    const value = row[columns.indexOf(column)]
    if (value === undefined || nulls.includes(value)) {
      missing = true
      return ''
    }
    return basename ? value.replace(/\/+$/, '').split('/').pop() ?? '' : value
  })
  return missing ? null : filled
}

/** The template's columns that the list does not have. */
export function unknownColumns(template: string, columns: readonly string[]): string[] {
  return [...template.matchAll(/\{([^}|]+)(\|basename)?\}/g)].map((match) => match[1]).filter((name) => !columns.includes(name))
}

/** Whether a row passes every "Only rows with" choice. */
export function rowPasses(choices: readonly ColumnChoice[], columns: readonly string[], row: readonly string[]): boolean {
  return choices.every((choice) => !choice.only.length || choice.only.includes(row[columns.indexOf(choice.name)] ?? ''))
}

/** The rows part of the import: templates, filters, kept, searchable and file detail columns. */
export function rowsOf(choices: readonly ColumnChoice[], kind: 'file' | 'folder', source: string, target: string): TableRows {
  const named = (...uses: ColumnUse[]) => choices.filter((choice) => uses.includes(choice.use)).map((choice) => choice.name)
  const skipped = named('skip')
  const size = named('size')[0]
  const modified = named('modified')[0]
  const checksums = choices
    .filter((choice) => choice.use === 'checksum' && choice.algorithm)
    .map((choice) => ({ algorithm: choice.algorithm!, column: choice.name }))
  return {
    kind,
    source,
    target,
    filter: choices.filter((choice) => choice.only.length).map((choice) => ({ column: choice.name, any_of: choice.only })),
    keep: skipped.length ? choices.filter((choice) => choice.use !== 'skip').map((choice) => choice.name) : null,
    text: named('search', 'search_filter'),
    exact: named('filter', 'search_filter'),
    ...(size ? { size } : {}),
    ...(checksums.length ? { checksums } : {}),
    ...(modified ? { modified } : {}),
  }
}

/** Search box text into words and `column=value` terms, with quotes for values with spaces. */
export function searchTerms(text: string): { words: string[]; exact: { column: string; value: string }[] } {
  const words: string[] = []
  const exact: { column: string; value: string }[] = []
  for (const match of text.matchAll(/([^\s=]+)="([^"]*)"|([^\s=]+)=(\S+)|(\S+)/g)) {
    if (match[1]) exact.push({ column: match[1], value: match[2] })
    else if (match[3]) exact.push({ column: match[3], value: match[4] })
    else words.push(match[5])
  }
  return { words, exact }
}

/** The `q` of a metadata search from words and exact terms. */
export function searchQuery(words: readonly string[], exact: ReadonlyArray<{ column: string; value: string }>): string {
  const terms = exact.map(({ column, value }) => (/\s/.test(value) ? `${column}="${value}"` : `${column}=${value}`))
  return [...words, ...terms].join(' ')
}

export interface ListPreset {
  name: string
  format: Partial<TableFormat>
  kind: 'file' | 'folder'
  uses: Record<string, ColumnUse>
}

/** Known lists; a preset sets the format, the row kind and the uses of the columns it knows. */
export const PRESETS: readonly ListPreset[] = [
  {
    name: 'NCBI assembly summary',
    format: { delimiter: '\t', header: 'last_comment', comment: '#', nulls: ['na', ''] },
    kind: 'folder',
    uses: {
      ftp_path: 'path',
      assembly_accession: 'search', bioproject: 'search', biosample: 'search', wgs_master: 'search',
      organism_name: 'search', infraspecific_name: 'search', isolate: 'search', asm_name: 'search',
      asm_submitter: 'search', gbrs_paired_asm: 'search',
      taxid: 'filter', species_taxid: 'filter', assembly_level: 'filter', group: 'filter',
    },
  },
]

/** The uses of a preset for the list's columns; columns it does not know are kept. */
export function presetUses(preset: ListPreset, columns: readonly string[]): ColumnChoice[] {
  return columns.map((name) => ({ name, use: preset.uses[name] ?? 'keep', only: [] }))
}
