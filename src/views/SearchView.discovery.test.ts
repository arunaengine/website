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

  it('folds the coverage numbers into one status disclosure', () => {
    const chip = readFileSync(
      fileURLToPath(new URL('../components/search/ObjectCoverageStatus.vue', import.meta.url)),
      'utf8',
    )

    expect(source).toContain('<ObjectCoverageStatus :coverage="objectCoverage" :status="objectCoverageStatus">')
    expect(source).not.toContain('Nodes queried:')
    expect(source).not.toContain('Freshness source:')
    expect(chip).toContain(':aria-expanded="open"')
    expect(chip).toContain(':aria-controls="detailsId"')
    expect(chip).toContain("{ label: 'Freshness source', value: freshness.source.replaceAll('_', ' ') }")
    expect(chip).toContain('title: freshness.as_of')
    expect(chip).toContain("label: 'Nodes queried'")
    expect(chip).toContain('<dl v-if="open"')
  })

  it('renders the exact fixed Dataset scope and preserves retryable ambiguity', () => {
    expect(source).toContain('Fixed Dataset scope')
    expect(source).toContain('runSparql(query, mode, documentScope.value ?? undefined)')
    expect(source).toContain('does not exist or is not readable by this session')
    expect(source).toContain('graph is unavailable or still materializing')
    expect(source).toContain('@click="runQuery">Retry</Button>')
  })
})
