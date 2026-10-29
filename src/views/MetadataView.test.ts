import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The page pulls in the whole portal, so the tab wiring is checked at the
// source: three tabs, the graph inside "For developers", and an opened node
// lands in the same dialog the file rows use.
const source = readFileSync(new URL('./MetadataView.vue', import.meta.url), 'utf8')

describe('MetadataView', () => {
  it('offers overview, where it came from and history, with the graph among the developer parts', () => {
    expect(source).toContain('<TabsTrigger value="overview">Overview</TabsTrigger>')
    expect(source).toContain('<TabsTrigger value="provenance">Where it came from</TabsTrigger>')
    expect(source).not.toContain('<TabsTrigger value="graph">')
    expect(source).toContain('For developers')
    expect(source).toContain('<DatasetGraph v-if="developersOpen" :state="state" @open="openInfo" />')
    expect(source).toContain('<template v-if="tab === \'overview\'">')
  })

  it('shows the dataset id once, in the developer section with a copy button', () => {
    expect(source.match(/\{\{ detailId \}\}/g)).toHaveLength(1)
    expect(source).toContain('<CopyButton :value="detailId" label="Copy the dataset id" />')
    expect(source).not.toContain('<DatasetHeader')
  })

  it('returns to the overview for a jump out of the entity dialog', () => {
    expect(source).toContain('@jump="jumpTo"')
    expect(source).toContain("tab.value = 'overview'")
  })

  it('keeps the repository links loaded on every tab for the published badge', () => {
    expect(source).toContain(':class="{ hidden: tab !== \'overview\' || !shown(\'repositories\') }"')
    expect(source).toContain('v-if="published.length"')
    expect(source).toContain(':hide-manage="!shown(\'repositories\')"')
    expect(source).toContain('@manage="manageRepositories"')
    expect(source).toContain('@publish="showPublish = true"')
  })
})
