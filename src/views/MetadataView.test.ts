import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The page pulls in the whole portal, so the tab wiring is checked at the
// source: three tabs, the graph inside "For developers", and an opened node
// lands in the same dialog the file rows use.
const source = readFileSync(new URL('./MetadataView.vue', import.meta.url), 'utf8')

describe('MetadataView', () => {
  it('offers overview, where it came from and history, with the graph among the developer parts', () => {
    expect(source).toContain('<TabsTrigger value="overview"><LayoutDashboard class="size-4" /> Overview</TabsTrigger>')
    // A phone names the provenance tab Source.
    expect(source).toContain('<span class="max-sm:hidden">Where it came from</span><span class="sm:hidden">Source</span>')
    expect(source).not.toContain('<TabsTrigger value="graph">')
    expect(source).toContain('For developers')
    expect(source).toContain('<DatasetGraph v-if="developersOpen" :state="state" @open="openInfo" />')
    expect(source).toContain('<template v-if="tab === \'overview\'">')
  })

  it('opens the developer section for every old graph link, also on a reused page', () => {
    expect(source).toContain("watch(routeTab, (value) => value === 'graph' && (developersOpen.value = true), { immediate: true })")
  })

  it('keeps the people, context and details of a run record in the developer section inside What ran', () => {
    const overview = source.slice(source.indexOf('<RunProvenancePanel'), source.indexOf('<ReuseDevelopers v-if'))
    const developers = source.slice(source.indexOf('<DefineDevelopers>'), source.indexOf('</DefineDevelopers>'))
    expect(overview).toContain('<ReuseDevelopers />\n          </RunProvenancePanel>')
    expect(overview).toContain('<template v-if="!runProvenance">\n            <PeopleSection')
    expect(developers).toContain('<template v-if="runProvenance">\n          <DetailsSection')
    expect(developers).toContain('<PeopleSection')
    expect(developers).toContain('<ContextSection')
    expect(overview).toContain('<DetailsSection\n            v-if="!runProvenance"')
  })

  it('opens the run results in the record group and on the node holding them', () => {
    const results = source.slice(source.indexOf('const runResults = computed'), source.indexOf('// The record\'s own card'))
    expect(results).toContain('folderRoute(folder.bucket, folder.prefix, groupId.value)')
    expect(results).toContain('.arn?.nodeId ?? run.site?.nodeId')
    expect(results).toContain('...(isLocalNode(node) ? {} : { node })')
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
