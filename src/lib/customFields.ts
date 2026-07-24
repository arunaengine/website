// Typed "Additional fields" rows shared by the create and edit metadata
// dialogs: each row is one key plus one typed value; repeated keys merge into
// a JSON array on emission. Types map to JSON-LD value shapes: text and date
// stay strings (dates ISO from the date input), number becomes a JSON number,
// iri becomes an {"@id"} reference.

export type CustomFieldType = 'text' | 'number' | 'date' | 'iri'

export interface CustomFieldRow {
  key: string
  type: CustomFieldType
  value: string
}

// A root property whose value is too structured to edit as a row; shown
// read-only so the user knows it exists and survives the save untouched.
export interface PreservedFieldRow {
  key: string
  note: string
}

export const CUSTOM_FIELD_TYPE_OPTIONS: Array<{ value: CustomFieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'iri', label: 'IRI / Link' },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

// One row's emitted JSON-LD value. A number that does not parse stays a string
// rather than silently becoming NaN or null.
export function typedFieldValue(row: CustomFieldRow): unknown {
  const raw = row.value.trim()
  if (row.type === 'number') {
    const parsed = Number(raw)
    return raw !== '' && Number.isFinite(parsed) ? parsed : raw
  }
  if (row.type === 'iri') return { '@id': raw }
  return raw
}

// Rows -> root property values: blank keys or values are dropped, repeated
// keys become arrays (single values stay scalars).
export function groupCustomFieldRows(rows: CustomFieldRow[]): Record<string, unknown> {
  const grouped: Record<string, unknown[]> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (!key || !row.value.trim()) continue
    ;(grouped[key] ??= []).push(typedFieldValue(row))
  }
  return Object.fromEntries(
    Object.entries(grouped).map(([key, values]) => [key, values.length === 1 ? values[0] : values]),
  )
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function scalarRow(key: string, value: unknown): CustomFieldRow | null {
  if (typeof value === 'number') return { key, type: 'number', value: String(value) }
  if (typeof value === 'boolean') return { key, type: 'text', value: String(value) }
  if (typeof value === 'string') return { key, type: ISO_DATE.test(value) ? 'date' : 'text', value }
  if (isRecord(value) && typeof value['@id'] === 'string' && Object.keys(value).length === 1) {
    return { key, type: 'iri', value: value['@id'] }
  }
  return null
}

// Seeds editable rows from a root entity's unmanaged properties. Scalars,
// bare {"@id"} references and arrays of those seed as rows (one row per array
// member, so the repeat-key -> array emission round-trips); anything deeper is
// reported as a read-only preserved row instead of being silently skipped.
export function seedCustomFieldRows(
  root: Record<string, unknown>,
  managedKeys: Set<string>,
): { rows: CustomFieldRow[]; preserved: PreservedFieldRow[] } {
  const rows: CustomFieldRow[] = []
  const preserved: PreservedFieldRow[] = []
  for (const [key, value] of Object.entries(root)) {
    if (managedKeys.has(key)) continue
    const entries = Array.isArray(value) ? value : [value]
    const seeded = entries.map((entry) => scalarRow(key, entry))
    if (seeded.length && seeded.every((row): row is CustomFieldRow => row !== null)) {
      rows.push(...seeded)
    } else {
      preserved.push({ key, note: Array.isArray(value) ? 'structured list' : 'structured value' })
    }
  }
  return { rows, preserved }
}
