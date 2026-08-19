import type { CustomFieldRow } from '@/lib/customFields'
import type { EntityEntry } from './entityEntries'
import { isHasPartUri } from './emit'
import type { ProfileControl, ProfilePropertyRule } from './types'

export interface ProfileDraftItem {
  property: string
  propertyUri: string
  label: string
  kind: 'generated' | 'entity'
  value: unknown
  multiple: boolean
  valueKind: ProfileControl['kind']
}

export interface ProfileDraftMigration {
  items: ProfileDraftItem[]
  targetRules: ProfilePropertyRule[]
}

const PROFILE_INDEPENDENT_DATASET_KEYS = new Set(['name', 'description', 'datePublished', 'license'])

export function cloneDraftValue<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function isDraftRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function entityDraftPopulated(entry: EntityEntry): boolean {
  if (entry.source === 'existing') return Boolean(entry.ref?.trim())
  return Boolean(entry.customId?.trim()) || draftValuePopulated(entry.instance ?? {})
}

export function draftValuePopulated(value: unknown): boolean {
  if (typeof value === 'string') return Boolean(value.trim())
  if (typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) {
    return value.some((entry) =>
      isDraftRecord(entry) && typeof entry.__uid === 'number'
        ? entityDraftPopulated(entry as unknown as EntityEntry)
        : draftValuePopulated(entry),
    )
  }
  if (!isDraftRecord(value)) return false
  return Object.values(value).some(draftValuePopulated)
}

function migrationValueCount(item: ProfileDraftItem): number {
  if (item.kind === 'entity') return (item.value as EntityEntry[]).length
  return Array.isArray(item.value) ? item.value.length : 1
}

export function migrationTarget(
  item: ProfileDraftItem,
  rules: ProfilePropertyRule[],
  controls: ProfileControl[],
): ProfileControl | undefined {
  const rule = rules.find((candidate) => candidate.propertyUri === item.propertyUri)
  if (!rule || PROFILE_INDEPENDENT_DATASET_KEYS.has(rule.valueName) || isHasPartUri(rule.propertyUri)) return undefined
  const control = controls.find((candidate) => candidate.property === rule.valueName)
  if (!control || (item.kind === 'entity') !== (control.control === 'entity')) return undefined
  if (!control.multiple && migrationValueCount(item) > 1) return undefined
  return control
}

export function draftItemPreview(item: ProfileDraftItem): string {
  if (item.kind === 'entity') {
    const count = (item.value as EntityEntry[]).length
    const rendered = JSON.stringify(stripDraftInternals(item.value))
    const preview = `${count} ${count === 1 ? 'entity draft' : 'entity drafts'}: ${rendered}`
    return preview.length > 120 ? `${preview.slice(0, 117)}…` : preview
  }
  const rendered = Array.isArray(item.value) ? item.value.join(', ') : String(item.value)
  return rendered.length > 120 ? `${rendered.slice(0, 117)}…` : rendered
}

function stripDraftInternals(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDraftInternals)
  if (!isDraftRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '__uid')
      .map(([key, entry]) => [key, stripDraftInternals(entry)]),
  )
}

function customRow(key: string, value: unknown, iri = false): CustomFieldRow {
  if (iri && typeof value === 'string') return { key, type: 'iri', value }
  if (typeof value === 'number') return { key, type: 'number', value: String(value) }
  if (typeof value === 'string') {
    return { key, type: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'date' : 'text', value }
  }
  if (isDraftRecord(value) && typeof value['@id'] === 'string' && Object.keys(value).length === 1) {
    return { key, type: 'iri', value: value['@id'] }
  }
  return { key, type: 'text', value: typeof value === 'boolean' ? String(value) : JSON.stringify(stripDraftInternals(value)) }
}

export function customRowsForDraft(item: ProfileDraftItem): CustomFieldRow[] {
  const key = item.propertyUri || item.property
  if (item.kind === 'generated') {
    const values = Array.isArray(item.value) ? item.value : [item.value]
    return values.map((value) => customRow(key, value, item.valueKind === 'select-object'))
  }
  return (item.value as EntityEntry[]).map((entry) => {
    if (entry.source === 'existing') return customRow(key, entry.ref?.trim() ?? '', true)
    return customRow(key, {
      source: 'new',
      ...(entry.customId?.trim() ? { customId: entry.customId.trim() } : {}),
      values: entry.instance ?? {},
    })
  })
}
