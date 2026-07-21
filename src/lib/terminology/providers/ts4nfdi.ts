// TS4NFDI federated terminology gateway provider.
//
// Endpoint: GET <gatewayUrl>/search?query=…&targetDbSchema=ols&omitArtefactsWithoutIri=true
// The gateway URL comes from portal runtime config (terminology.gatewayUrl).
// The portal never depends on the service being reachable — the bundled
// vocabulary always stands on its own when the gateway is offline.
//
// The response shape is loosely typed across gateway backends, so every hit is
// runtime-validated and malformed hits are dropped silently. Verified live
// (2026-07-18) against the ols target schema, the envelope is
//   { response: { docs: [hit…], page }, responseHeader }
// and a hit carries `iri` + `label` (strings), `description` (array of strings,
// often empty; other backends return a plain string), `ontology_name`,
// `short_form`, and `type` (either a plain token like "property" or an OWL URI
// like "http://www.w3.org/2002/07/owl#Class").
import { portalConfig } from '../../config'
import { fetchWithTimeout } from '../../fetch'
import { isRecord } from '../../profiles/uri'
import type { TermHit, TerminologyProvider, TermKind } from '../types'

export const TS4NFDI_PROVIDER_ID = 'ts4nfdi'

// Remote budget: the gateway is a SLOW federated fan-out (verified live
// 2026-07-21: healthy responses in 2-10+ seconds; CORS is open). The picker is
// non-blocking — bundled results render instantly and remote hits stream in
// under a pending indicator — so a generous budget costs only a longer spinner,
// while a tight one made the service look permanently broken. A dead or
// CORS-blocked gateway still fails fast, and per-provider negative caching
// keeps a hung one from re-stalling every keystroke.
const REQUEST_TIMEOUT_MS = 20_000

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

// `description` is a string[] on the ols schema (often empty) and a plain
// string on other backends; anything else counts as absent.
function definitionField(value: unknown): string | undefined {
  if (typeof value === 'string') return stringField(value)
  if (Array.isArray(value)) return value.find((entry) => typeof entry === 'string' && entry.trim())?.trim()
  return undefined
}

// Hit `type` -> TermKind: plain tokens ("property", "class") and OWL URIs
// ("…#ObjectProperty", "…#Class") both occur; unknown values degrade to 'term'.
function kindField(value: unknown): TermKind {
  if (typeof value !== 'string') return 'term'
  const token = value.toLowerCase()
  if (token.includes('property')) return 'property'
  if (token === 'class' || token.endsWith('#class') || token.endsWith('/class')) return 'class'
  return 'term'
}

// Runtime validation of the loosely-typed gateway response: require iri + label
// strings per hit, tolerate the rest, drop malformed hits silently. Exported
// for direct testing against captured live responses.
export function parseGatewayHits(raw: unknown): TermHit[] {
  const envelope = isRecord(raw) && isRecord(raw.response) ? raw.response : raw
  const docs = Array.isArray(envelope) ? envelope : isRecord(envelope) && Array.isArray(envelope.docs) ? envelope.docs : []
  const hits: TermHit[] = []
  for (const doc of docs) {
    if (!isRecord(doc)) continue
    const iri = stringField(doc.iri)
    const label = stringField(doc.label)
    if (!iri || !label) continue
    const hit: TermHit = {
      iri,
      label,
      source: stringField(doc.ontology_name) ?? stringField(doc.ontology) ?? TS4NFDI_PROVIDER_ID,
      providerId: TS4NFDI_PROVIDER_ID,
      kind: kindField(doc.type),
    }
    const definition = definitionField(doc.description)
    if (definition) hit.definition = definition
    const ontology = stringField(doc.ontology_name) ?? stringField(doc.ontology)
    if (ontology) hit.ontology = ontology
    const shortForm = stringField(doc.short_form)
    if (shortForm) hit.shortForm = shortForm
    const backendType = stringField(doc.backend_type)
    if (backendType) hit.backendType = backendType
    hits.push(hit)
  }
  return hits
}

export const ts4nfdiProvider: TerminologyProvider = {
  id: TS4NFDI_PROVIDER_ID,
  label: 'TS4NFDI terminology gateway',
  kinds: ['property', 'class', 'term'],
  async search(query, { limit, signal }) {
    const base = portalConfig().terminology.gatewayUrl.replace(/\/+$/, '')
    const url = `${base}/search?query=${encodeURIComponent(query)}&targetDbSchema=ols&omitArtefactsWithoutIri=true`
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' }, signal }, REQUEST_TIMEOUT_MS)
    if (!response.ok) throw new Error(`Terminology gateway responded with HTTP ${response.status}`)
    return parseGatewayHits(await response.json()).slice(0, limit)
  },
}
