// The problems the node reported for a draft, in one shape: the check response
// and the issues a failed write returned collapse into the same list, so the
// check panel groups exactly the same things.

import {
  ApiError,
  profileValidationFindings,
  type ProfileValidationPreviewResponse,
  type RoCrateStructuralViolation,
} from '@/lib/api'
import { displayName, entityName, findEntity, rootId, type CrateDraft } from '@/lib/crate/editor'
import { crateLocalId } from '@/lib/shacl/crateIri'

export type IssueSeverity = 'violation' | 'warning' | 'info'

export interface CheckIssue {
  key: string
  code: string
  message: string
  /** The node's own wording, kept when the message above was rewritten. */
  detail?: string
  entityId: string
  /** False when no draft entity carries the id the node reported. */
  resolved: boolean
  path?: string | null
  severity: IssueSeverity
}

export interface WriteIssue {
  code?: string
  message: string
  entityId?: string | null
  path?: string | null
  severity?: string
}

const ROOT_ID = './'
const SCHEMA_PREFIX = 'schema:'

// The node imports a crate into a scratch graph and names the root after it, so
// every id below the graph IRI belongs to an entity of the draft being checked.
export const VALIDATION_GRAPH_IRI = 'https://craqle.invalid/validation/document'
const VALIDATION_BASE = 'https://craqle.invalid/'

interface RawIssue {
  key: string
  code: string
  message: string
  entityId?: string | null
  path?: string | null
  severity: IssueSeverity
}

function severityOf(value: string | undefined): IssueSeverity {
  return value === 'warning' || value === 'info' ? value : 'violation'
}

function unwrapId(nodeId: string): string {
  const trimmed = nodeId.trim()
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1).trim() : trimmed
}

/** The draft entity an id names, with or without the './' of a relative file id. */
function matchEntity(draft: CrateDraft, id: string): string | undefined {
  if (id === ROOT_ID || id === rootId(draft)) return rootId(draft)
  if (findEntity(draft, id)) return id
  const swapped = id.startsWith('./') ? id.slice(2) : `./${id}`
  return findEntity(draft, swapped) ? swapped : undefined
}

/**
 * The draft entity a node reported about. `resolved` is false when nothing in
 * the draft carries the id, so callers can still show the node's raw wording.
 */
export function resolveEntityId(draft: CrateDraft, nodeId: string): { id: string; resolved: boolean } {
  const raw = unwrapId(nodeId)
  if (!raw || raw === VALIDATION_GRAPH_IRI) return { id: rootId(draft), resolved: true }
  const local = crateLocalId(raw)
  const inner = local.startsWith(VALIDATION_BASE) ? local.slice(VALIDATION_BASE.length) : local
  const found = matchEntity(draft, local) ?? matchEntity(draft, inner)
  return found ? { id: found, resolved: true } : { id: raw, resolved: false }
}

/** How a message should call an entity: the root reads as 'this dataset'. */
function entityLabel(draft: CrateDraft, id: string): string {
  const entity = findEntity(draft, id)
  if (id === rootId(draft)) return entityName(entity) || 'this dataset'
  return entity ? displayName(entity) : id
}

function requiredProperty(message: string): string {
  const quoted = /`([^`]+)`/.exec(message)?.[1] ?? ''
  return quoted.startsWith(SCHEMA_PREFIX) ? quoted.slice(SCHEMA_PREFIX.length) : quoted
}

// A bare id is only swapped when it is an absolute IRI: a crate-local id like
// './' also occurs inside file paths the message quotes.
function replaceId(message: string, id: string, label: string): string {
  if (!id || !label) return message
  const named = message.split(`<${id}>`).join(label).split(`\`${id}\``).join(label)
  return id.includes('://') ? named.split(id).join(label) : named
}

function present(issue: RawIssue, draft: CrateDraft): CheckIssue {
  const raw = unwrapId(issue.entityId ?? '')
  const { id, resolved } = resolveEntityId(draft, raw)
  const property = issue.code === 'missing_required_property' ? requiredProperty(issue.message) : ''
  if (property) {
    return {
      ...issue,
      entityId: id,
      resolved,
      path: property,
      message: `Missing required property: ${property}`,
      detail: issue.message,
    }
  }
  const label = entityLabel(draft, id)
  const named = replaceId(replaceId(issue.message, raw, label), VALIDATION_GRAPH_IRI, entityLabel(draft, rootId(draft)))
  return {
    ...issue,
    entityId: id,
    resolved,
    message: named,
    ...(named === issue.message ? {} : { detail: issue.message }),
  }
}

export function collectIssues(
  result: ProfileValidationPreviewResponse | null | undefined,
  writeIssues: WriteIssue[],
  draft: CrateDraft,
): CheckIssue[] {
  const raw: RawIssue[] = [
    ...(result?.structural_violations ?? []).map((issue) => ({
      key: `structural:${issue.code}:${issue.pointer ?? ''}`,
      code: issue.code,
      message: issue.message,
      entityId: issue.entity_id,
      path: issue.pointer,
      severity: 'violation' as const,
    })),
    ...(result?.findings ?? []).map((issue) => ({
      key: `finding:${issue.code}:${issue.focus_node ?? ''}:${issue.path ?? ''}`,
      code: issue.code,
      message: issue.message,
      entityId: issue.focus_node,
      path: issue.path,
      severity: severityOf(issue.severity),
    })),
    ...writeIssues.map((issue, index) => ({
      key: `write:${issue.code ?? index}:${issue.entityId ?? ''}:${issue.path ?? ''}`,
      code: issue.code ?? 'write',
      message: issue.message,
      entityId: issue.entityId,
      path: issue.path,
      severity: severityOf(issue.severity),
    })),
  ]
  return raw.map((issue) => present(issue, draft))
}

/** True for a request the node refused outright. */
export function isNodeRejection(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 400
}

function structuralViolations(error: ApiError): RoCrateStructuralViolation[] {
  const violations = error.details?.violations
  if (!Array.isArray(violations)) return []
  return violations.filter((value): value is RoCrateStructuralViolation =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value)
      && typeof (value as Record<string, unknown>).message === 'string'))
}

/**
 * Everything a refused write or preview said, as write issues. A 400 without
 * violations or findings still becomes one issue, so the node's error and code
 * reach the drawer instead of a bare status line.
 */
export function rejectionIssues(error: unknown): WriteIssue[] {
  if (!(error instanceof ApiError)) return []
  const issues: WriteIssue[] = [
    ...structuralViolations(error).map((issue) => ({
      code: issue.code,
      message: issue.message,
      entityId: issue.entity_id,
      path: issue.pointer,
      severity: 'violation',
    })),
    ...profileValidationFindings(error).map((finding) => ({
      code: finding.code,
      message: finding.message,
      entityId: finding.focus_node,
      path: finding.path,
      severity: finding.severity,
    })),
  ]
  if (issues.length || error.status !== 400) return issues
  const detail = typeof error.details?.details === 'string' ? error.details.details : ''
  return [{
    code: error.code ?? 'bad_request',
    message: detail ? `${error.message}: ${detail}` : error.message,
    severity: 'violation',
  }]
}
