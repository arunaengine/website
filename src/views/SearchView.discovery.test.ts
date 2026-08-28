import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

const objects = read('../components/datasets/DatasetObjectResults.vue')
const workbench = read('../components/datasets/SparqlWorkbench.vue')
const workbenchState = read('../composables/useSparqlWorkbench.ts')

describe('object discovery and dataset-scoped SPARQL presentation', () => {
  it('places object coverage before results and exposes strict mode without downgrade copy', () => {
    const coverage = objects.indexOf('Object inventory coverage is intentionally before every hit.')
    const results = objects.indexOf('v-for="hit in objectResults"')
    expect(coverage).toBeGreaterThanOrEqual(0)
    expect(results).toBeGreaterThan(coverage)
    expect(objects).toContain('Partial object inventory. Coverage is incomplete')
    expect(objects).toContain('Strict mode did not fall back to best-effort')
    expect(objects).toContain('OBJECT_SEARCH_MODE_LABELS[hit.mode]')
    expect(objects).toContain(':to="objectHitRoute(hit)"')
    expect(objects).toContain(':title="hit.updated_at"')
  })

  it('keeps the coverage numbers in a modal behind an icon', () => {
    const icon = read('../components/search/CoverageIcon.vue')

    expect(objects).toContain(':complete="objectCoverageComplete"')
    expect(objects).toContain('@click="showCoverageStats = true"')
    expect(objects).toContain('v-model:open="showCoverageStats"')
    expect(objects).toContain(':request-ms="objectRequestMs"')
    expect(objects).not.toContain('Nodes queried')
    expect(objects).not.toContain('Freshness source')
    // The icon says nothing: no status word reaches the page itself.
    expect(icon).toContain(':aria-label="label"')
    expect(icon).not.toContain('{{ ')
  })

  it('renders the exact fixed dataset scope and preserves retryable ambiguity', () => {
    expect(workbench).toContain('Fixed dataset scope')
    expect(workbenchState).toContain('runSparql(query, mode, documentScope.value ?? undefined)')
    expect(workbenchState).toContain('does not exist or is not readable by this session')
    expect(workbenchState).toContain('graph is unavailable or still materializing')
    expect(workbench).toContain('@click="runQuery">Retry</Button>')
  })
})
