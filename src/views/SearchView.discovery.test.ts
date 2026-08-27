import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('./SearchView.vue', import.meta.url)), 'utf8')

describe('object discovery and Dataset-scoped SPARQL presentation', () => {
  it('places object coverage before results and exposes strict mode without downgrade copy', () => {
    const coverage = source.indexOf('Object inventory coverage is intentionally before every hit.')
    const results = source.indexOf('v-for="hit in objectResults"')
    expect(coverage).toBeGreaterThanOrEqual(0)
    expect(results).toBeGreaterThan(coverage)
    expect(source).toContain('Partial object inventory. Coverage is incomplete')
    expect(source).toContain('Strict mode did not fall back to best-effort')
    expect(source).toContain('OBJECT_SEARCH_MODE_LABELS[hit.mode]')
    expect(source).toContain(':to="objectHitRoute(hit)"')
    expect(source).toContain(':title="hit.updated_at"')
  })

  it('keeps the coverage numbers in a modal behind an icon', () => {
    const icon = readFileSync(
      fileURLToPath(new URL('../components/search/CoverageIcon.vue', import.meta.url)),
      'utf8',
    )

    expect(source).toContain(':complete="objectCoverageComplete"')
    expect(source).toContain('@click="showCoverageStats = true"')
    expect(source).toContain('v-model:open="showCoverageStats"')
    expect(source).toContain(':request-ms="objectRequestMs"')
    expect(source).not.toContain('Nodes queried')
    expect(source).not.toContain('Freshness source')
    // The icon says nothing: no status word reaches the page itself.
    expect(icon).toContain(':aria-label="label"')
    expect(icon).not.toContain('{{ ')
  })

  it('renders the exact fixed Dataset scope and preserves retryable ambiguity', () => {
    expect(source).toContain('Fixed Dataset scope')
    expect(source).toContain('runSparql(query, mode, documentScope.value ?? undefined)')
    expect(source).toContain('does not exist or is not readable by this session')
    expect(source).toContain('graph is unavailable or still materializing')
    expect(source).toContain('@click="runQuery">Retry</Button>')
  })
})
