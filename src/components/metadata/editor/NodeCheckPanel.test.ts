import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  button,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  nodes,
} from '@/test/clientRender'
import * as Issues from '@/lib/crate/issues'
import * as Editor from '@/lib/crate/editor'
import * as Utils from '@/lib/utils'
import type { ProfileValidationPreviewResponse } from '@/lib/api'

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const BadgeStub = defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))
const NoticeStub = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const EmptyStub = defineComponent(() => () => null)

const NodeCheckPanel = compileClientComponent(new URL('./NodeCheckPanel.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Spinner.vue': moduleDefault(EmptyStub),
  '@/components/ui/CopyButton.vue': moduleDefault(EmptyStub),
  '@/lib/crate/issues': Issues,
  '@/lib/crate/editor': Editor,
  '@/lib/utils': Utils,
})

function draft() {
  const base = Editor.newDraft()
  return Editor.updateValue(base, './', 'name', 0, 'Example dataset')
}

function verdict(overrides: Partial<ProfileValidationPreviewResponse> = {}): ProfileValidationPreviewResponse {
  return {
    accepted: true,
    state: 'valid',
    evaluator: 'craqle',
    findings: [],
    completeness: 'complete',
    structural_violations: [],
    ...overrides,
  }
}

function mount(props: Record<string, unknown>) {
  return mountApp(NodeCheckPanel, {
    props: { draft: draft(), rocrate: { '@graph': [] }, canSave: true, ...props },
  })
}

describe('NodeCheckPanel', () => {
  it('reports an accepted draft without a profile', async () => {
    const mounted = await mount({ previewResult: verdict() })

    expect(content(mounted.root)).toContain('The node would accept this dataset.')
    expect(content(mounted.root)).toContain('No profile referenced')
    expect(content(mounted.root)).not.toContain('would reject')
    mounted.app.unmount()
  })

  it('names the profile a draft validated against', async () => {
    const mounted = await mount({
      previewResult: verdict({ profile_iri: 'https://example.test/profile' }),
      profileName: 'Genomics profile',
    })

    expect(content(mounted.root)).toContain('Valid against Genomics profile')
    mounted.app.unmount()
  })

  it('groups the problems per entity with the advisory ones last', async () => {
    const person = Editor.addEntity(draft(), { type: 'Person', name: 'Ada Example' })
    const mounted = await mount({
      draft: person.draft,
      previewResult: verdict({
        accepted: false,
        state: 'invalid',
        structural_violations: [{ code: 'missing', message: 'A required value is missing.', entity_id: './', pointer: null }],
        findings: [{
          code: 'advice',
          severity: 'warning',
          rule: 'sh:minCount',
          message: 'An affiliation is recommended.',
          focus_node: '#ada-example',
          completeness: 'complete',
        }],
      }),
    })
    const text = content(mounted.root)

    expect(text).toContain('The node would reject this dataset: 1 problem')
    expect(text).toContain('Example dataset')
    expect(text).toContain('Ada Example')
    expect(text).toContain('Advisory')
    expect(text.indexOf('A required value is missing.')).toBeLessThan(text.indexOf('An affiliation is recommended.'))
    mounted.app.unmount()
  })

  it('explains a check that could not run', async () => {
    const mounted = await mount({ previewUnavailable: true })

    expect(content(mounted.root)).toContain('Could not check: This node does not offer draft checks; the save is still validated.')
    mounted.app.unmount()
  })

  it('shows only the run in progress while checking', async () => {
    const mounted = await mount({ previewRunning: true, previewResult: verdict({ accepted: false, state: 'invalid' }) })

    expect(content(mounted.root)).toContain('Checking')
    expect(content(mounted.root)).not.toContain('would reject')
    mounted.app.unmount()
  })

  it('disables the action while the dataset cannot be saved', async () => {
    const mounted = await mount({ canSave: false })

    expect(button(mounted.root, 'Create dataset').props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('keeps the JSON-LD behind a closed disclosure', async () => {
    const mounted = await mount({ previewResult: verdict() })
    const details = element(mounted.root, (node) => node.tag === 'details')

    expect(details.props.open).toBe(false)
    expect(nodes(mounted.root).some((node) => node.tag === 'summary')).toBe(true)
    expect(content(mounted.root)).toContain('Show JSON-LD')
    mounted.app.unmount()
  })
})
