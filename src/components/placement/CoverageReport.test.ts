import { readFileSync } from 'node:fs'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as VueRuntime from 'vue'
import { createSSRApp, effectScope, h, nextTick, reactive } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import { useRefresh } from '@/composables/useRefresh'
import * as Api from '@/lib/api'
import * as PlacementPolicies from '@/lib/placementPolicies'
import * as Utils from '@/lib/utils'
import ComputeAdminPanel from '@/components/compute-admin/ComputeAdminPanel.vue'
import ComputeQuotaFields from '@/components/compute-admin/ComputeQuotaFields.vue'
import BucketPlacementSection from './BucketPlacementSection.vue'
import CoverageReport from './CoverageReport.vue'
import PlacementPolicyPanel from './PlacementPolicyPanel.vue'
import PlacementPolicyEditor from './PlacementPolicyEditor.vue'
import type { BulkRunResponse, CoverageResponse } from '@/lib/placementPolicies'

const placementPolicyMocks = {
  getBucketPlacement: vi.fn(),
  getPlacementCoverage: vi.fn(),
  putBucketPlacement: vi.fn(),
  runBucketPlacement: vi.fn(),
  loadPolicyPage: vi.fn(),
}

const placementPolicyState = {
  sessionPolicies: { value: [] },
  sessionPolicyRefs: { value: [] },
  listedPolicies: { value: [] },
  listState: { value: 'ready' },
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
    setup: (props: { open: boolean; bucket: string }, context: Record<string, unknown>) => {
      startBulkRun: () => Promise<void>
    }
  }
}

const BucketPlacementSetup = compileSetupComponent(new URL('./BucketPlacementSection.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => ({}) }),
  '@/composables/usePlacementPolicies': {
    usePlacementPolicies: () => ({ ...placementPolicyMocks, ...placementPolicyState }),
  },
  '@/composables/useRefresh': { useRefresh },
  '@/lib/api': Api,
  '@/lib/placementPolicies': PlacementPolicies,
  '@/lib/utils': Utils,
})

const report: CoverageResponse = {
  bucket: 'datasets',
  scope: 'current',
  generation: 4,
  target_policies: [],
  observed: 10,
  deleted: 1,
  gaps: [{
    key: 'raw/sample.fastq',
    version_id: '01J00000000000000000000000',
    attachment: 'missing',
    copy: 'quarantined',
  }],
  registered: 7,
  quarantined: 1,
  absent: 1,
  reference_only: 1,
  complete: true,
  limits: ['responder_local', 'bounded_page', 'concurrent_writes'],
}

describe('CoverageReport', () => {
  it('compiles the new admin panel components', () => {
    expect([
      ComputeAdminPanel,
      ComputeQuotaFields,
      BucketPlacementSection,
      PlacementPolicyPanel,
      PlacementPolicyEditor,
    ]).toHaveLength(5)
  })

  it('always renders every backend limit as an inline caveat', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(CoverageReport, { report }) }))

    expect(html).toContain('Report caveats:')
    expect(html).toContain('Responder-local view only')
    expect(html).toContain('Bounded page')
    expect(html).toContain('Concurrent writes may not be reflected')
    expect(html).toContain('never means realm-wide convergence')
  })

  it('stops a bucket bulk run after the section closes', async () => {
    let resolvePage!: (value: BulkRunResponse) => void
    placementPolicyMocks.getBucketPlacement.mockResolvedValue({ bucket: 'datasets', policies: [], generation: 1 })
    placementPolicyMocks.getPlacementCoverage.mockResolvedValue(report)
    placementPolicyMocks.runBucketPlacement.mockImplementationOnce(() => new Promise((resolve) => { resolvePage = resolve }))
    const props = reactive({ open: true, bucket: 'datasets' })
    const scope = effectScope()
    const bindings = scope.run(() => BucketPlacementSetup.setup(
      props,
      { emit: vi.fn(), expose: vi.fn(), attrs: {}, slots: {} },
    ))!

    const run = bindings.startBulkRun()
    await Promise.resolve()
    expect(placementPolicyMocks.runBucketPlacement).toHaveBeenCalledTimes(1)

    props.open = false
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

    expect(placementPolicyMocks.runBucketPlacement).toHaveBeenCalledTimes(1)
    scope.stop()
  })
})
