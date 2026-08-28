export function graph(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object') return []
  const graphValue = (value as Record<string, unknown>)['@graph']
  return Array.isArray(graphValue) ? graphValue.filter(isRecord) : []
}

export function primaryEntity(value: unknown): Record<string, unknown> | undefined {
  const entries = graph(value)
  const descriptor = entries.find((entry) => entry['@id'] === 'ro-crate-metadata.json')
  const rootId = idValue(descriptor?.about)
  return (
    (rootId ? entries.find((entry) => entry['@id'] === rootId) : undefined) ??
    entries.find((entry) => entry['@id'] !== 'ro-crate-metadata.json')
  )
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function textValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return textValue(value[0])
  if (isRecord(value)) return textValue(value.name ?? value['@id'] ?? value.id)
  return ''
}

export function idValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (isRecord(value)) return textValue(value['@id'] ?? value.id)
  return ''
}

export function arrayText(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean)
  const single = textValue(value)
  return single ? [single] : []
}

export function typeList(entity?: Record<string, unknown>): string[] {
  return arrayText(entity?.['@type'])
}

export function people(value: unknown) {
  return arrayText(value).map((name) => ({ name, role: 'Contributor', affiliation: undefined }))
}

export function idValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(idValues)
  if (isRecord(value)) return idValues(value['@id'] ?? value.id)
  return []
}
