import * as VueRuntime from 'vue'
import { defineComponent, h, reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, content, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as Assignable from '@/lib/profiles/assignable'
import type { ProfileReference, ProfileReferenceWarning } from '@/composables/useProfileReferences'

const EmptyStub = defineComponent(() => () => null)
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const NoticeStub = defineComponent({
  props: { tone: { type: String, default: 'info' } },
  setup: (props, { slots }) => () => h('div', { 'data-tone': props.tone }, slots.default?.()),
})
const RouterLinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()),
})

const ProfileVisibility = compileClientComponent(new URL('./ProfileVisibility.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: RouterLinkStub },
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Tooltip.vue': moduleDefault(Passthrough),
  '@/lib/profiles/assignable': Assignable,
})

function dataset(index: number, groupId = 'group-2'): ProfileReference {
  return { documentId: `doc-${index}`, groupId, title: `Dataset ${index}` }
}

function warningOf(datasets: ProfileReference[], overrides: Partial<ProfileReferenceWarning> = {}) {
  return {
    message: `${datasets.length} datasets declare this profile. Datasets of other groups will no longer be able to save until they remove it or the profile is public again.`,
    failed: false,
    incomplete: false,
    datasets,
    ...overrides,
  }
}

const builder = () => reactive({ isPublic: false, groupId: 'group-1' })

describe('ProfileVisibility reference warning', () => {
  it('names the declaring datasets and counts the rest', async () => {
    const datasets = [dataset(1, 'group-1'), ...Array.from({ length: 9 }, (_, index) => dataset(index + 2))]
    const mounted = await mountApp(ProfileVisibility, {
      props: { builder: builder(), referenceWarning: warningOf(datasets, { incomplete: true }) },
    })

    const text = content(mounted.root)
    expect(text).toContain('10 datasets declare this profile.')
    expect(text).toContain('Datasets of other groups will no longer be able to save')
    expect(text).toContain('and 2 more')
    expect(text).toContain('Some nodes did not answer, so this list may be incomplete.')

    const links = nodes(mounted.root).filter((node) => node.tag === 'a')
    expect(links).toHaveLength(8)
    expect(links[0]?.props['data-to']).toBe(JSON.stringify({ name: 'dataset', params: { id: 'doc-1' } }))
    // The profile's own group keeps saving (decision P9), so its datasets say so.
    expect(text).toContain('Dataset 1 (this group, keeps working)')
    expect(text).not.toContain('Dataset 2 (this group')
    mounted.app.unmount()
  })

  it('shows a failed lookup without a list', async () => {
    const mounted = await mountApp(ProfileVisibility, {
      props: {
        builder: builder(),
        referenceWarning: warningOf([], {
          message: 'Could not check which datasets declare this profile.',
          failed: true,
        }),
      },
    })

    expect(content(mounted.root)).toContain('Could not check which datasets declare this profile.')
    expect(nodes(mounted.root).filter((node) => node.tag === 'a')).toHaveLength(0)
    mounted.app.unmount()
  })

  it('stays silent without a warning and while read-only', async () => {
    const plain = await mountApp(ProfileVisibility, { props: { builder: builder() } })
    expect(content(plain.root)).not.toContain('declare this profile')
    plain.app.unmount()

    const review = await mountApp(ProfileVisibility, {
      props: { builder: builder(), readonly: true, referenceWarning: warningOf([dataset(1)]) },
    })
    expect(content(review.root)).not.toContain('declare this profile')
    review.app.unmount()
  })
})
