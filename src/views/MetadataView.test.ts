import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The page pulls in the whole portal, so the layout wiring is checked at the source: four tabs, every
// section at once on the overview, and an opened entity lands in the same dialog the file rows use.
const source = readFileSync(new URL('./MetadataView.vue', import.meta.url), 'utf8')
const details = readFileSync(new URL('../components/metadata/view/DatasetDetails.vue', import.meta.url), 'utf8')

describe('MetadataView', () => {
  it('offers overview, provenance, history and JSON-LD tabs', () => {
    expect(source).toContain('<TabsTrigger value="overview"><LayoutDashboard class="size-4" /> Overview</TabsTrigger>')
    expect(source).toContain('<TabsTrigger value="provenance"><GitBranch class="size-4" /> Provenance</TabsTrigger>')
    expect(source).toContain('<TabsTrigger v-if="historyShown" value="history">')
    expect(source).toContain('<TabsTrigger value="jsonld"><Braces class="size-4" /> JSON-LD</TabsTrigger>')
    expect(source).not.toContain('<TabsTrigger value="graph">')
    expect(source).toContain('<template v-if="tab === \'overview\'">')
  })

  it('shows every section at once in the agreed order, without area segments', () => {
    const overview = source.slice(source.indexOf('<template v-if="tab === \'overview\'">'))
    const order = [
      '<DatasetAbout',
      'part="people"',
      'part="places"',
      '<RunProvenancePanel',
      '<CrateRuns',
      '<DatasetFiles',
      '<SubcratesSection',
      'title="Software"',
      '<DatasetDetails',
      ':entities="otherEntities"',
    ].map((marker) => overview.indexOf(marker))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(source).not.toContain("'seg')")
    expect(source).not.toMatch(/routeSeg|segments|seg\.value/)
  })

  it('pairs short sections and lets a card without its partner span both columns', () => {
    expect(source).toContain("const first = 'lg:[&:has(+:empty)]:col-span-2'")
    expect(source).toContain("const second = 'lg:[:empty+&]:col-span-2'")
    expect(source).not.toContain('grid-flow-dense')
    const cells = [...source.matchAll(/:class="\[cell, ([^\]]+)\]"/g)].map((match) => match[1])
    expect(cells).toEqual(['first', 'second', 'first', 'second', 'first', "entityView === 'list' ? second : 'lg:col-span-2'", "'lg:col-span-2'"])
  })

  it('shows people and places right after About, and hides their row when both are empty', () => {
    const about = source.indexOf('<DatasetAbout')
    const row = source.indexOf('<div class="hidden gap-6 has-[>:not(:empty)]:grid lg:grid-cols-2">')
    expect(row).toBeGreaterThan(about)
    expect(source.slice(about, row)).not.toMatch(/<(RunProvenancePanel|CrateRuns|DatasetFiles)/)
    expect(source.slice(row, source.indexOf('</div>\n', source.indexOf('part="places"')))).toContain('part="people"')
  })

  it('switches only the entities between list and graph, and opens the graph for old links', () => {
    expect(source).toContain("useRouteTab(['list', 'graph'], 'list', 'entities')")
    expect(source).toContain("routeTab.value === 'graph' || route.query.seg === 'graph' ? 'graph' : routeEntities.value")
    const toggle = source.slice(source.indexOf('<template v-if="entityView === \'list\'">'), source.indexOf('<DatasetDetails'))
    expect(toggle).toContain('<DatasetGraph v-else :state="state" hide-heading')
  })

  it('shows a run record in full under Runs with the other runs as a table', () => {
    const runs = source.slice(source.indexOf('<div v-if="runProvenance || actionCount"'), source.indexOf('<DatasetFiles'))
    expect(runs).toContain('<RunProvenancePanel v-if="runProvenance"')
    expect(runs).toContain(':skip="runProvenance?.actionId"')
  })

  it('puts the type pill on the title line, not between title and byline', () => {
    const title = source.slice(source.indexOf('<template #title>'), source.indexOf('#description>'))
    expect(title).toContain('<CrateTypeBadge v-if="current" :type="crateType" :crate="currentCrate" />')
    expect(source).toContain('<template v-if="bylineNames.length" #description>')
  })

  it('opens the run results in the record group and on the node holding them', () => {
    const results = source.slice(source.indexOf('const runResults = computed'), source.indexOf('// The record\'s own card'))
    expect(results).toContain('folderRoute(folder.bucket, folder.prefix, groupId.value)')
    expect(results).toContain('.arn?.nodeId ?? run.site?.nodeId')
    expect(results).toContain('...(isLocalNode(node) ? {} : { node })')
  })

  it('shows the dataset id once, in Details with a copy button', () => {
    expect(source).not.toContain('{{ detailId }}')
    expect(details).toContain('<CopyButton :value="detailId" label="Copy the dataset ID" />')
  })

  it('returns to the overview for a jump out of the entity dialog', () => {
    expect(source).toContain('@jump="jumpTo"')
    expect(source).toContain("entityView.value = 'list'")
  })

  it('keeps the repository links loaded on every tab for the published badge', () => {
    expect(source).toContain(":class=\"{ hidden: tab !== 'overview' || !shown('repositories') }\"")
    expect(source).toContain('v-if="published.length"')
    expect(source).toContain(':hide-manage="!shown(\'repositories\')"')
    expect(source).toContain('@manage="manageRepositories"')
    expect(source).toContain('@publish="showPublish = true"')
  })
})
