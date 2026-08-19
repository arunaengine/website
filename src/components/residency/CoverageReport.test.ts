import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import ComputeAdminPanel from '@/components/compute-admin/ComputeAdminPanel.vue'
import ComputeQuotaFields from '@/components/compute-admin/ComputeQuotaFields.vue'
import BucketPolicyDialog from './BucketPolicyDialog.vue'
import CoverageReport from './CoverageReport.vue'
import ResidencyAdminPanel from './ResidencyAdminPanel.vue'
import ResidencyPolicyEditor from './ResidencyPolicyEditor.vue'
import type { CoverageResponse } from '@/lib/placementPolicies'

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
      BucketPolicyDialog,
      ResidencyAdminPanel,
      ResidencyPolicyEditor,
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
})
