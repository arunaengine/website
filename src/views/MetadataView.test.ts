import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The page pulls in the whole portal, so the tab wiring is checked at the
// source: the graph tab exists, the graph draws the loaded crate read-only,
// and an opened node lands in the same dialog the file rows use.
const source = readFileSync(new URL('./MetadataView.vue', import.meta.url), 'utf8')

describe('MetadataView', () => {
  it('shows the crate graph on its own tab', () => {
    expect(source).toContain('<TabsTrigger value="overview">Overview</TabsTrigger>')
    expect(source).toContain('<TabsTrigger value="graph">Graph</TabsTrigger>')
    expect(source).toContain('<DatasetGraph v-if="tab === \'graph\'" :state="state" @open="openInfo" />')
    expect(source).toContain('<template v-if="tab === \'overview\'">')
  })

  it('returns to the overview for a jump out of the entity dialog', () => {
    expect(source).toContain('@jump="jumpTo"')
    expect(source).toContain("tab.value = 'overview'")
  })
})
