import type { SparqlExecutionMode, SparqlResult } from '@/data/types'
import {
  type BucketSearchResponse,
  type MetadataSearchOptions,
  type MetadataSearchResponse,
  type ObjectSearchOptions,
  type ObjectSearchResponse,
  type SparqlResponse,
  type UnifiedSearchOptions,
  type UnifiedSearchResponse,
} from '@/lib/api'
import { request } from './state'

export const DEFAULT_SPARQL_MODE: SparqlExecutionMode = 'distributed-strict'

export class IncompleteSparqlResultError extends Error {
  constructor(public result: SparqlResult) {
    super('Strict distributed query did not return complete coverage.')
    this.name = 'IncompleteSparqlResultError'
  }
}

export function sparqlCoverageStatus(result: SparqlResult): 'Complete' | 'Partial' | 'Unavailable' {
  if (result.complete) return 'Complete'
  return result.nodesQueried > result.nodesFailed ? 'Partial' : 'Unavailable'
}

export function buildSparqlExportArtifact(
  result: SparqlResult,
  context: { query: string; scope: string; timestamp: string },
) {
  const rows = { columns: result.columns, rows: result.rows }
  return buildCompletenessExportArtifact(rows, result.complete, {
    schema: 'aruna.sparql-completeness.v1',
    query: context.query,
    scope: context.scope,
    mode: result.mode,
    timestamp: context.timestamp,
    result_count: result.totalRows,
    truncation: null,
    freshness: null,
    complete: result.complete,
    status: sparqlCoverageStatus(result).toLowerCase(),
    failed_coverage: {
      nodes_queried: result.nodesQueried,
      nodes_failed: result.nodesFailed,
      failed_partitions: result.failedPartitions,
    },
  })
}

export function buildCompletenessExportArtifact<T>(
  results: T,
  complete: boolean,
  completenessManifest: Record<string, unknown>,
) {
  return complete ? results : { completeness_manifest: completenessManifest, results }
}

export function buildObjectSearchExportArtifact(
  result: Pick<ObjectSearchResponse, 'hits' | 'coverage'>,
  context: { query: string; timestamp: string },
) {
  const coverage = result.coverage
  const complete = coverage.complete && !coverage.truncated
  return buildCompletenessExportArtifact(result.hits, complete, {
    schema: 'aruna.object-search-completeness.v1',
    query: context.query,
    scope: coverage.scope,
    mode: coverage.mode,
    timestamp: context.timestamp,
    result_count: result.hits.length,
    truncation: coverage.truncated,
    freshness: coverage.index_freshness,
    complete,
    status: complete ? 'complete' : 'partial',
    failed_coverage: {
      nodes_queried: coverage.nodes_queried,
      nodes_failed: coverage.nodes_failed,
      failed_partitions: coverage.failed_partitions,
      omitted_partitions: coverage.omitted_partitions,
    },
  })
}

export async function runSparql(
  query: string,
  mode: SparqlExecutionMode,
  documentId?: string,
): Promise<SparqlResult> {
  const started = performance.now()
  const path = documentId
    ? `/metadata/${encodeURIComponent(documentId)}/sparql/query`
    : '/metadata/sparql/query'
  const result = await request<SparqlResponse>(path, {
    method: 'POST',
    body: JSON.stringify({
      query,
      mode: mode === 'local' ? 'local' : 'distributed',
      allow_partial: mode !== 'distributed-strict',
    }),
  })
  const coverage = {
    complete: result.complete,
    nodesQueried: result.nodes_queried,
    nodesFailed: result.nodes_failed,
    failedPartitions: result.failed_partitions,
    mode,
  }
  let mapped: SparqlResult
  if (result.kind === 'Boolean') {
    mapped = {
      columns: ['value'],
      rows: [{ value: result.complete ? String(result.value) : 'unknown' }],
      tookMs: Math.max(1, Math.round(performance.now() - started)),
      totalRows: 1,
      ...coverage,
    }
  } else {
    const rows = Array.isArray(result.value) ? result.value : []
    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
    mapped = {
      columns,
      rows,
      tookMs: Math.max(1, Math.round(performance.now() - started)),
      totalRows: rows.length,
      ...coverage,
    }
  }
  if (mode === 'distributed-strict' && !mapped.complete) throw new IncompleteSparqlResultError(mapped)
  return mapped
}

export async function searchMetadata(
  query: string,
  options: MetadataSearchOptions = {},
): Promise<MetadataSearchResponse> {
  return request<MetadataSearchResponse>('/metadata/search', {
    query: {
      q: query,
      // Backend defaults to 25 and clamps 1..=100; mirror the clamp here.
      limit: Math.min(Math.max(options.limit ?? 25, 1), 100),
      // Query- and filter-bound cursor: the backend rejects a cursor whose
      // fingerprint no longer matches the query or filters with 400. apiRequest
      // drops undefined, so these are absent when the caller omits them.
      cursor: options.cursor,
      group_id: options.group_id,
      conforms_to: options.conforms_to,
    },
    signal: options.signal,
  })
}

export async function searchUnified(
  query: string,
  options: UnifiedSearchOptions = {},
): Promise<UnifiedSearchResponse> {
  return request<UnifiedSearchResponse>('/search', {
    query: {
      q: query,
      // A cursor is only accepted with exactly one type (backend contract).
      types: options.types?.length ? options.types.join(',') : undefined,
      limit: options.limit,
      cursor: options.cursor,
      group_id: options.group_id,
      conforms_to: options.conforms_to,
      mode: options.mode,
    },
    signal: options.signal,
  })
}

export async function searchObjects(
  query: string,
  options: ObjectSearchOptions = {},
): Promise<ObjectSearchResponse> {
  return request<ObjectSearchResponse>('/search/objects', {
    query: {
      q: query,
      bucket: options.bucket,
      match: options.match,
      mode: options.mode ?? 'distributed_best_effort',
      limit: Math.min(Math.max(options.limit ?? 10, 1), 100),
      cursor: options.cursor,
    },
    signal: options.signal,
  })
}

// GET /search/buckets: federated bucket-name substring search. Auth required.
export async function searchBuckets(
  q: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<BucketSearchResponse> {
  return request<BucketSearchResponse>('/search/buckets', {
    // Backend default is 10, clamped 1..=50; mirror the clamp here.
    query: { q, limit: Math.min(Math.max(options.limit ?? 10, 1), 50) },
    signal: options.signal,
  })
}
