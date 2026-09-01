import { readFileSync } from 'node:fs'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as VueRuntime from 'vue'
import { createSSRApp, effectScope, h, nextTick, reactive } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as PlacementPolicies from '@/lib/placementPolicies'
import * as Utils from '@/lib/utils'
import CoverageReport from './CoverageReport.vue'
import type { BulkRunResponse, CoverageResponse } from '@/lib/placementPolicies'

const placementMocks = {
  getPlacementCoverage: vi.fn(),
  runBucketPlacement: vi.fn(),
}

function compileSetupComponent(url: URL, modules: Record<string, unknown>) {
  const source = readFileSync(url, 'utf8')
  const { descriptor } = parse(source, { filename: url.pathname })
  const script = compileScript(descriptor, { id: url.pathname, inlineTemplate: false })
  const javascript = transpileModule(script.content, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText
  const cjs = { exports: {} as Record<string, unknown> }
  const localRequire = (id: string) => {
    if (id in modules) return modules[id]
    if (id.startsWith('@/components/')) return { __esModule: true, default: {} }
    throw new Error(`Missing test module ${id}`)
  }
  new Function('require', 'exports', 'module', javascript)(localRequire, cjs.exports, cjs)
  return cjs.exports.default as {
    setup: (
      props: { bucket: string; canApply: boolean; blockedReason: string | null },
      context: Record<string, unknown>,
    ) => { applyToExisting: () => Promise<void> }
  }
}

const ComplianceSetup = compileSetupComponent(
  new URL('../storage/BucketComplianceSection.vue', import.meta.url),
  {
    vue: VueRuntime,
    '@lucide/vue': new Proxy({}, { get: () => ({}) }),
    '@/composables/usePlacementPolicies': { usePlacementPolicies: () => placementMocks },
    '@/lib/api': Api,
    '@/lib/placementPolicies': PlacementPolicies,
    '@/lib/utils': Utils,
  },
)

const report: CoverageResponse = {
  bucket: 'datasets',
  scope: 'current',
  generation: 4,
  target_policies: [],
  observed: 10,
  deleted: 1,
  gaps: [
    {
      key: 'raw/sample.fastq',
      version_id: '01J00000000000000000000000',
      attachment: 'missing',
      copy: 'quarantined',
    },
  ],
  registered: 7,
  quarantined: 1,
  absent: 1,
  reference_only: 1,
  complete: true,
  limits: ['responder_local', 'bounded_page', 'concurrent_writes'],
}

describe('coverage report', () => {
  it('renders every backend caveat in plain words', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(CoverageReport, { report }) }))

    expect(html).toContain('Counted on this node only')
    expect(html).toContain('One page of a longer listing')
    expect(html).toContain('Writes during the count may be missing')
    expect(html).not.toContain('responder')
    expect(html).not.toContain('convergence')
  })

  it('names the gap without implementation words', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(CoverageReport, { report }) }))

    expect(html).toContain('raw/sample.fastq')
    expect(html).toContain('none attached')
    expect(html).toContain('held back here')
  })

  it('stops a catch-up run once the section moved to another bucket', async () => {
    let resolvePage!: (value: BulkRunResponse) => void
    placementMocks.getPlacementCoverage.mockResolvedValue(report)
    placementMocks.runBucketPlacement.mockImplementationOnce(
      () => new Promise((resolve) => { resolvePage = resolve }),
    )
    const props = reactive({ bucket: 'datasets', canApply: true, blockedReason: null })
    const scope = effectScope()
    const bindings = scope.run(() =>
      ComplianceSetup.setup(props, { emit: vi.fn(), expose: vi.fn(), attrs: {}, slots: {} }),
    )!

    const run = bindings.applyToExisting()
    await Promise.resolve()
    expect(placementMocks.runBucketPlacement).toHaveBeenCalledTimes(1)

    props.bucket = 'another'
    await nextTick()
    resolvePage({
      operation_id: '01J00000000000000000000000',
      status: 'active',
      generation: 1,
      target_policies: [],
      observed: 1,
      covered: 1,
      minted: 0,
      replanned: 0,
      blocked: [],
      cursor: 'next',
      complete: false,
    })
    await run

    expect(placementMocks.runBucketPlacement).toHaveBeenCalledTimes(1)
    scope.stop()
  })
})
