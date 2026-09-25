import {
  ApiError,
  profileValidationFindings,
  type ProfileValidationFinding,
  type RepositoryLink,
  type RepositoryRecord,
  type RepositoryRecordSource,
  type RepositoryReviewState,
  type RepositorySearchPage,
  type RepositoryConnectorRequest,
  type SecondaryIdentifier,
} from './api'
import type { PersistentIdView } from './pid'
import { findEntity, rootEntity, rootId, type CrateDraft, type DraftEntity } from './crate/editor'
import type { ProfileEntityRule, ProfilePropertyRule } from './profiles/types'
import { isDatasetType, normalizeTypeUri, sameSchemaOrgType } from './profiles/uri'
import { crateLocalId } from './shacl/crateIri'
import { pathMembers } from './shacl/mapFindings'
import { stateVariant, type BadgeVariant } from './stateBadge'
import { errorMessage } from './utils'

// Presentation of repository answers: search hits, link states and the
// secondary identifiers a dataset holds.

export interface RepositoryHit {
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
export function searchHit(raw: unknown): RepositoryHit | null {
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

export function searchHits(page: RepositorySearchPage | null): RepositoryHit[] {
  const hits = page?.hits?.hits
  return Array.isArray(hits) ? hits.flatMap((raw) => searchHit(raw) ?? []) : []
}

/** Total number of matches, or null when the repository did not say. */
export function searchTotal(page: RepositorySearchPage | null): number | null {
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
    'The record was changed in the repository outside Aruna. Accept the remote state to continue from it, or remove the link.',
  token_rejected: 'The repository rejected the access token. Change the token to continue.',
  source_unavailable: 'Some data could not be read, so the push stopped. It did not leave files out.',
  owner_not_holder:
    'The node that manages this link no longer holds the dataset, so it cannot push. Remove the link and create a new one.',
  requirements_unmet:
    'The dataset does not meet the repository requirements. Fix the points below. The link pushes again on the next change.',
  update_available: 'A newer version is available in the repository.',
  local_changed:
    'A newer version is available. This dataset was changed here since the last update, so it is not imported automatically. Update now replaces the dataset metadata. Local files stay.',
  review_declined:
    'The community declined the record, so it is not published automatically. Publish to submit it again.',
}

// Pull links read with the group's repository token, not a personal one.
const PULL_REASON_TEXT: Record<string, string> = {
  token_rejected:
    "The repository rejected the group's repository token. Someone who manages the group's metadata can change it under Sources.",
  source_unavailable: 'The record was withdrawn or deleted in the repository, so no updates can be imported.',
  owner_not_holder:
    'The node that manages this link no longer holds the dataset, so it cannot import updates. Remove the link.',
}

/** A readable sentence for a status reason; unknown reasons read as their words. */
export function failureText(reason: string | null | undefined, pull = false): string {
  const failed = pull ? 'The last update failed' : 'The last push failed'
  if (!reason) return `${failed}.`
  return (pull ? PULL_REASON_TEXT[reason] : undefined) ?? REASON_TEXT[reason] ?? `${failed}: ${reason.replaceAll('_', ' ')}.`
}

const REVIEW_TEXT: Record<RepositoryReviewState, string | null> = {
  none: null,
  pending: 'Waiting for community review',
  accepted: 'Accepted by the community',
  declined: 'Declined by the community',
}

export function reviewText(review: RepositoryReviewState | undefined): string | null {
  return review ? REVIEW_TEXT[review] ?? null : null
}

const REMOTE_STATE: Record<string, { label: string; variant: BadgeVariant }> = {
  none: { label: 'No record yet', variant: 'secondary' },
  draft: { label: 'Draft', variant: 'secondary' },
  review: { label: 'In review', variant: 'outline' },
  published: { label: 'Published', variant: 'success' },
}

/** The remote record state of a push link; older nodes only say whether it is published. */
export function remoteState(remote: RepositoryLink['remote']): { label: string; variant: BadgeVariant } {
  const state = remote.state ?? (remote.published ? 'published' : 'draft')
  return REMOTE_STATE[state] ?? { label: state.replaceAll('_', ' '), variant: 'secondary' }
}

// Pull links check the remote; push links send changes.
export function isPullLink(link: Pick<RepositoryLink, 'direction'>): boolean {
  return link.direction === 'pull'
}

/** Keep polling while a push waits or a community review is open. */
export function linkBusy(link: RepositoryLink): boolean {
  return link.pending || link.remote.review === 'pending'
}

export interface LinkRights {
  // Publish, token and settings changes, including auto_update.
  owner: boolean
  // Pause, resume, push, pull, accept remote state and delete.
  manage: boolean
}

export function linkRights(link: Pick<RepositoryLink, 'created_by'>, userId: string, groupAdmin: boolean): LinkRights {
  const owner = Boolean(userId) && link.created_by === userId
  return { owner, manage: owner || groupAdmin }
}

function nodeRoot(url: string, origin: string): string {
  try {
    return new URL(url, origin).href.replace(/\/+$/, '')
  } catch {
    return url.replace(/\/+$/, '')
  }
}

/** Whether the node the portal talks to manages the link; only that node acts on it. */
export function managedHere(ownerNodeUrl: string, apiBaseUrl: string, origin: string): boolean {
  return !ownerNodeUrl || nodeRoot(ownerNodeUrl, origin) === nodeRoot(apiBaseUrl, origin)
}

const STATUS_LABEL: Record<string, string> = { enabled: 'Enabled', paused: 'Paused', failed: 'Failed' }

export function linkStatus(link: Pick<RepositoryLink, 'status'>): { label: string; variant: BadgeVariant } {
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
export function sourceParent(rows: readonly PersistentIdView[], endpoint: string): SecondaryIdentifier | null {
  const parents = secondaryIdentifiers(rows, 'invenio_parent')
  return parents.find((entry) => !entry.endpoint || sameEndpoint(entry.endpoint, endpoint)) ?? null
}

/** Whether an enabled pull link already imports updates from this record lineage. */
export function pullsParent(links: readonly RepositoryLink[], parentId: string, endpoint: string): boolean {
  return links.some(
    (link) =>
      isPullLink(link) && link.status === 'enabled' && link.remote.parent_id === parentId && sameEndpoint(link.endpoint, endpoint),
  )
}

/** The record an import names: a DOI, a record URL or a plain record id. */
export function recordSource(input: string): RepositoryRecordSource | null {
  const text = input.trim()
  if (!text) return null
  const doi = text.match(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,}\/\S+)$/i)
  if (doi) return { doi: doi[1] }
  if (/^https?:\/\//i.test(text)) return { url: text }
  return /\s/.test(text) ? null : { record_id: text }
}

export const REPOSITORY_PRESETS = [
  { name: 'Zenodo', endpoint: 'https://zenodo.org/api/' },
  { name: 'Zenodo sandbox', endpoint: 'https://sandbox.zenodo.org/api/' },
] as const

/** Why the backend would refuse this Invenio endpoint, or null when it looks fine. */
export function endpointProblem(endpoint: string): string | null {
  let url: URL
  try {
    url = new URL(endpoint.trim())
  } catch {
    return 'Enter a full URL, for example https://zenodo.org/api/.'
  }
  const host = endpoint.trim().replace(/^[a-z]+:\/\//i, '').split(/[/:]/)[0]
  if (host !== host.toLowerCase()) return 'Write the host name in lowercase.'
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    return 'Use https. Plain http is only allowed for localhost.'
  }
  if (url.username || url.password || url.search || url.hash) return 'Remove user names, queries and fragments.'
  return null
}

/** The account page where a user creates a personal access token. */
export function tokenPageUrl(endpoint: string): string | null {
  try {
    return `${new URL(endpoint).origin}/account/settings/applications/tokens/new/`
  } catch {
    return null
  }
}

/** Zenodo by name when the endpoint is Zenodo, else the connector name. */
export function repositoryLabel(connector: { name: string; endpoint: string } | null): string {
  if (!connector) return 'the repository'
  try {
    const host = new URL(connector.endpoint).hostname
    if (host === 'zenodo.org') return 'Zenodo'
    if (host === 'sandbox.zenodo.org') return 'Zenodo sandbox'
  } catch {
    // A connector name is fine for anything else.
  }
  return connector.name
}

/** The findings of a 400 requirements_unmet answer, or null for other errors. */
export function unmetFindings(err: unknown): ProfileValidationFinding[] | null {
  if (!(err instanceof ApiError) || err.status !== 400 || err.code !== 'requirements_unmet') return null
  return profileValidationFindings(err)
}

/** A readable repository error; `connector` reads a 404 as a removed repository. */
export function repositoryError(err: unknown, connector = false): string {
  if (err instanceof ApiError && err.code === 'not_supported') return 'This kind of repository does not offer this action.'
  if (connector && err instanceof ApiError && err.status === 404) {
    return 'The repository was not found. It may have been removed from the group.'
  }
  return errorMessage(err)
}

export interface RequirementRow {
  entityId: string
  property: string
  rule: ProfilePropertyRule
}

// The backend reports the root as ./ and other entities by their crate id.
function focusEntity(draft: CrateDraft, focus: string): DraftEntity | undefined {
  const id = crateLocalId(focus)
  if (id === './') return findEntity(draft, id) ?? rootEntity(draft)
  return findEntity(draft, id) ?? draft.entities.find((entity) => entity.id.startsWith('#') && focus.endsWith(entity.id))
}

/** One form row per failing field that a lifted profile rule can edit. */
export function requirementRows(
  draft: CrateDraft,
  entities: readonly ProfileEntityRule[],
  findings: readonly ProfileValidationFinding[],
): RequirementRow[] {
  const rows: RequirementRow[] = []
  for (const finding of findings) {
    if (finding.severity === 'info' || !finding.path) continue
    const entity = focusEntity(draft, finding.focus_node ?? '')
    if (!entity) continue
    const root = entity.id === rootId(draft)
    const shape = entities.find((candidate) =>
      root
        ? isDatasetType(candidate.type)
        : entity.types.some((type) => sameSchemaOrgType(normalizeTypeUri(type), candidate.type)),
    )
    const rule = pathMembers(finding.path)
      .map((member) => shape?.propertyRules.find((candidate) => sameSchemaOrgType(candidate.propertyUri, member)))
      .find(Boolean)
    if (!rule || rows.some((row) => row.entityId === entity.id && row.property === rule.valueName)) continue
    rows.push({ entityId: entity.id, property: rule.valueName, rule })
  }
  return rows
}

/** The repository record of a finished one-time export, when the result has one. */
export function exportRepository(result: unknown): RepositoryRecord | null {
  const repository = record(record(result).repository)
  return text(repository.id) ? (repository as unknown as RepositoryRecord) : null
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
