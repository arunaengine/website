import { crateGraph, crateRootId, dataEntitiesOf, stringProp } from '@/lib/dataEntities'

// Shared RO-Crate import helpers: structural validation + preview summary for
// every surface that accepts an uploaded/pasted crate (the metadata detail
// page's import-replace and the create dialog's import mode), plus the export
// download counterpart. Validation is deliberately structural only — the
// backend accepts arbitrary crates, so this is a sanity gate, not a schema.

export interface CrateImportPreview {
  crate: unknown
  source: string
  rootName: string
  entityCount: number
  fileCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

// Sanity checks before anything is written: parseable JSON that structurally
// looks like an RO-Crate (@context plus a @graph with a findable root dataset).
export function analyzeCrateJson(text: string, source: string): CrateImportPreview {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (err) {
    throw new Error(`Not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!isRecord(json)) throw new Error('Expected a JSON object, not an array or scalar.')
  if (!('@context' in json)) throw new Error('Not an RO-Crate: the top-level @context is missing.')
  const graph = crateGraph(json)
  if (!graph.length) throw new Error('Not an RO-Crate: @graph is missing or empty.')
  const rootId = crateRootId(json)
  const root = rootId ? graph.find((entity) => entity['@id'] === rootId) : undefined
  if (!root) throw new Error('Not an RO-Crate: no root dataset entity was found in @graph.')
  return {
    crate: json,
    source,
    rootName: stringProp(root.name) || rootId || 'Untitled dataset',
    entityCount: graph.length,
    fileCount: dataEntitiesOf(json).length,
  }
}

// RO-Crate spec filename so the download drops straight into a crate directory.
export function downloadCrateJson(crate: unknown) {
  const blob = new Blob([JSON.stringify(crate, null, 2)], { type: 'application/ld+json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'ro-crate-metadata.json'
  anchor.click()
  URL.revokeObjectURL(url)
}
