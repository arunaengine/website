import type { InvenioLink, InvenioSearchPage, RepositoryConnectorRequest, SecondaryIdentifier } from './api'
import type { PersistentIdView } from './pid'
import { stateVariant, type BadgeVariant } from './stateBadge'

// Presentation of Invenio and Zenodo answers: search hits, link states and the
// secondary identifiers a dataset holds.

export interface InvenioHit {
  id: string
  title: string
  date: string
  creators: string[]
  doi: string
  url: string
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

// InvenioRDM nests creators under person_or_org; legacy Zenodo JSON has a name.
function creatorName(value: unknown): string {
  const creator = record(value)
  const person = record(creator.person_or_org)
  const family = text(person.family_name)
  const given = text(person.given_name)
  return text(person.name) || [family, given].filter(Boolean).join(', ') || text(creator.name)
}

/** One search hit, or null when it has no record id to import. */
export function searchHit(raw: unknown): InvenioHit | null {
  const hit = record(raw)
  const id = text(hit.id) || text(hit.recid)
  if (!id) return null
  const metadata = record(hit.metadata)
  const pids = record(record(hit.pids).doi)
  const links = record(hit.links)
  const creators = Array.isArray(metadata.creators) ? metadata.creators.map(creatorName).filter(Boolean) : []
  return {
    id,
    title: text(metadata.title) || text(hit.title) || id,
    date: text(metadata.publication_date),
    creators,
    doi: text(pids.identifier) || text(hit.doi) || text(metadata.doi),
    url: text(links.self_html) || text(links.html),
  }
}

export function searchHits(page: InvenioSearchPage | null): InvenioHit[] {
  const hits = page?.hits?.hits
  return Array.isArray(hits) ? hits.flatMap((raw) => searchHit(raw) ?? []) : []
}

/** Total number of matches, or null when the repository did not say. */
export function searchTotal(page: InvenioSearchPage | null): number | null {
  const total = page?.hits?.total
  if (typeof total === 'number') return total
  if (total && typeof total.value === 'number') return total.value
  return null
}

export function doiUrl(doi: string): string {
  return `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}`
}

/** Identifiers of one kind across all PID rows, without duplicates. */
export function secondaryIdentifiers(rows: readonly PersistentIdView[], kind: string): SecondaryIdentifier[] {
  const seen = new Set<string>()
  const found: SecondaryIdentifier[] = []
  for (const entry of rows.flatMap((row) => row.secondary_identifiers ?? [])) {
    const key = `${entry.value}|${entry.endpoint ?? ''}`
    if (entry.kind !== kind || !entry.value || seen.has(key)) continue
    seen.add(key)
    found.push(entry)
  }
  return found
}

const REASON_TEXT: Record<string, string> = {
  remote_changed:
    'The repository record changed outside Aruna. Check it in the repository, then push again or remove the link.',
  token_rejected: 'The repository rejected the access token. Change the token to continue.',
  source_unavailable: 'Some data could not be read, so the push stopped. It did not leave files out.',
}

/** A readable sentence for a failure reason; unknown reasons read as their words. */
export function failureText(reason: string | null | undefined): string {
  if (!reason) return 'The last push failed.'
  return REASON_TEXT[reason] ?? `The last push failed: ${reason.replaceAll('_', ' ')}.`
}

const STATUS_LABEL: Record<string, string> = { enabled: 'Enabled', paused: 'Paused', failed: 'Failed' }

export function linkStatus(link: Pick<InvenioLink, 'status'>): { label: string; variant: BadgeVariant } {
  const label = STATUS_LABEL[link.status] ?? link.status
  return { label, variant: stateVariant(link.status) }
}

export interface ConnectorForm {
  name: string
  kind: RepositoryConnectorRequest['kind']
  endpoint: string
  community: string
  token: string
  removeToken: boolean
}

// An edit that leaves the token empty keeps the stored one unless removal is
// asked for; OAI-PMH never carries a token.
export function connectorBody(form: ConnectorForm, editing: boolean): RepositoryConnectorRequest {
  const invenio = form.kind === 'invenio'
  const body: RepositoryConnectorRequest = { name: form.name.trim(), kind: form.kind, endpoint: form.endpoint.trim() }
  if (invenio && form.community.trim()) body.community = form.community.trim()
  const typed = invenio ? form.token.trim() : ''
  if (typed) body.secret_config = { token: typed }
  else if (!editing || form.removeToken || !invenio) body.secret_config = {}
  return body
}

function sameEndpoint(a: string, b: string): boolean {
  return a.trim().replace(/\/+$/, '').toLowerCase() === b.trim().replace(/\/+$/, '').toLowerCase()
}

/** The source record lineage a new link may continue on this endpoint. */
export function sourceParent(rows: readonly PersistentIdView[], endpoint: string): string | null {
  const parents = secondaryIdentifiers(rows, 'invenio_parent')
  const match = parents.find((entry) => !entry.endpoint || sameEndpoint(entry.endpoint, endpoint))
  return match?.value ?? null
}

/** An optional metadata override typed as JSON; it must be an object. */
export function parseOverride(text: string): { value?: Record<string, unknown>; error?: string } {
  if (!text.trim()) return {}
  try {
    const value: unknown = JSON.parse(text)
    if (value && typeof value === 'object' && !Array.isArray(value)) return { value: value as Record<string, unknown> }
    return { error: 'The override must be a JSON object.' }
  } catch {
    return { error: 'The override is not valid JSON.' }
  }
}
