import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, content, flush, mountApp } from '@/test/clientRender'
import * as Repository from '@/lib/repository'
import * as MapFindings from '@/lib/shacl/mapFindings'
import * as Uri from '@/lib/profiles/uri'

const Findings = compileClientComponent(new URL('./RequirementFindings.vue', import.meta.url), {
  vue: VueRuntime,
  '@/lib/repository': Repository,
  '@/lib/shacl/mapFindings': MapFindings,
  '@/lib/profiles/uri': Uri,
})

const base = { severity: 'violation', focus_node: './', completeness: 'complete' }

describe('RequirementFindings', () => {
  it('names record and structural findings plainly and counts the omitted rest', async () => {
    const findings = [
      { ...base, code: 'mapping_violation', rule: 'record/creators', path: 'creators', message: 'The mapped record has no creators.' },
      { ...base, code: 'missing_root', rule: 'structural', path: '/@graph/0', message: 'No root dataset.' },
    ]
    const mounted = await mountApp(Findings, { props: { findings, omitted: 3 } })
    await flush()
    const text = content(mounted.root)

    expect(text).toContain('Missing in the repository record:creators The mapped record has no creators.')
    expect(text).toContain('Not a valid RO-Crate: No root dataset.')
    expect(text).not.toContain('@graph')
    expect(text).toContain('3 more not shown.')
    mounted.app.unmount()
  })
})
