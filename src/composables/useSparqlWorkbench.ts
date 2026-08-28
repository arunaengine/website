// Workbench state for the Datasets route's SPARQL branch. It lives beside the
// browse and search state, so toggling the branch keeps the typed query and the
// answer it produced.
import { ref, watch, type Ref } from 'vue'
import {
  buildSparqlExportArtifact,
  DEFAULT_SPARQL_MODE,
  IncompleteSparqlResultError,
  useAruna,
} from '@/composables/useAruna'
import { errorMessage } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import type { SparqlExecutionMode, SparqlResult } from '@/data/types'

export const SPARQL_MODE_LABELS: Record<SparqlExecutionMode, string> = {
  local: 'Local',
  'distributed-best-effort': 'Distributed best-effort',
  'distributed-strict': 'Distributed strict',
}

export function useSparqlWorkbench(documentScope: Ref<string | null>) {
  const { realm, runSparql } = useAruna()

  const sparql = ref(`SELECT DISTINCT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 25`)
  const sparqlMode = ref<SparqlExecutionMode>(DEFAULT_SPARQL_MODE)
  const sparqlResult = ref<SparqlResult | null>(null)
  const sparqlResultQuery = ref('')
  const sparqlError = ref<string | null>(null)
  const sparqlFailure = ref(false)
  const sparqlFailureResult = ref<SparqlResult | null>(null)
  const sparqlFailureMode = ref<SparqlExecutionMode | null>(null)
  const running = ref(false)

  watch(documentScope, () => {
    sparqlMode.value = DEFAULT_SPARQL_MODE
    sparqlResult.value = null
    sparqlResultQuery.value = ''
    sparqlError.value = null
    sparqlFailure.value = false
    sparqlFailureResult.value = null
    sparqlFailureMode.value = null
  })

  function downloadSparqlResult() {
    const result = sparqlResult.value
    if (!result) return
    const artifact = buildSparqlExportArtifact(result, {
      query: sparqlResultQuery.value,
      scope: documentScope.value ?? realm.value.id,
      timestamp: new Date().toISOString(),
    })
    const url = URL.createObjectURL(new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = result.complete ? 'sparql-results.json' : 'sparql-partial-results-with-manifest.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  function sparqlFailureMessage(error: unknown): string {
    if (documentScope.value && error instanceof ApiError && error.status === 404) {
      return 'This dataset does not exist or is not readable by this session. The two cases are intentionally indistinguishable.'
    }
    if (documentScope.value && error instanceof ApiError && error.status === 503) {
      return 'This dataset graph is unavailable or still materializing. Retry when it is ready.'
    }
    return errorMessage(error)
  }

  async function runQuery() {
    sparqlError.value = null
    sparqlFailure.value = false
    sparqlFailureResult.value = null
    sparqlFailureMode.value = null
    const query = sparql.value
    const mode = sparqlMode.value
    const selectClause = query.match(/(?:^|[>\r\n])\s*SELECT\b([\s\S]*?)(?:\bWHERE\b|\{)/i)?.[1]
    if (!documentScope.value && mode !== 'local' && selectClause !== undefined && !/\bDISTINCT\b/i.test(selectClause)) {
      sparqlError.value = 'Distributed SELECT queries must include DISTINCT in the SELECT clause.'
      sparqlResult.value = null
      return
    }
    running.value = true
    try {
      sparqlResult.value = await runSparql(query, mode, documentScope.value ?? undefined)
      sparqlResultQuery.value = query
    } catch (err) {
      sparqlError.value = sparqlFailureMessage(err)
      sparqlFailure.value = true
      sparqlFailureResult.value = err instanceof IncompleteSparqlResultError ? err.result : null
      sparqlFailureMode.value = mode
      sparqlResult.value = null
    } finally {
      running.value = false
    }
  }

  return {
    documentScope,
    sparql,
    sparqlMode,
    sparqlResult,
    sparqlError,
    sparqlFailure,
    sparqlFailureResult,
    sparqlFailureMode,
    running,
    downloadSparqlResult,
    runQuery,
  }
}

export type SparqlWorkbenchState = ReturnType<typeof useSparqlWorkbench>
