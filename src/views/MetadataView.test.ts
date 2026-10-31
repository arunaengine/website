import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The page pulls in the whole portal, so the layout wiring is checked at the source: four tabs, one
// area at a time on the overview, and an opened entity lands in the same dialog the file rows use.
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

  it('puts About first, then one area chosen in the seg query', () => {
    const overview = source.slice(source.indexOf('<template v-if="tab === \'overview\'">'))
    expect(overview.indexOf('<DatasetAbout')).toBeLessThan(overview.indexOf('<OptionToggle'))
    expect(source).toContain("useRouteTab(['files', 'people', 'runs', 'graph', 'details'], '', 'seg')")
    expect(source).toContain("return isRun.value && actionCount.value ? 'runs' : 'files'")
    // An old graph tab link opens the graph area.
    expect(source).toContain("const wanted = routeTab.value === 'graph' ? 'graph' : routeSeg.value")
  })

  it('shows a run record in full under Runs with the other runs as a table', () => {
    const runs = source.slice(source.indexOf('<template v-else-if="seg === \'runs\'">'), source.indexOf('<DatasetGraph'))
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
    expect(source).toContain("tab.value = 'overview'")
  })

  it('keeps the repository links loaded on every tab for the published badge', () => {
    expect(source).toContain(":class=\"{ hidden: tab !== 'overview' || seg !== 'details' || !shown('repositories') }\"")
    expect(source).toContain('v-if="published.length"')
    expect(source).toContain(':hide-manage="!shown(\'repositories\')"')
    expect(source).toContain('@manage="manageRepositories"')
    expect(source).toContain('@publish="showPublish = true"')
  })
})
