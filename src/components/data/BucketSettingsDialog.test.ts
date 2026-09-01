import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import {
  compileClientComponent,
  content,
  mountApp,
  moduleDefault,
  type HostNode,
} from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { slots }) => () => h(tag, slots.default?.()) })
const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const DetailDialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () =>
    props.open ? h('div', [slots.header?.(), slots.default?.(), slots.footer?.()]) : null,
})
const SectionStub = (name: string) =>
  defineComponent({ props: { open: Boolean, bucket: String }, setup: () => () => h('section', name) })

const dialog = compileClientComponent(new URL('./BucketSettingsDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/data/BucketRoutingSection.vue': moduleDefault(SectionStub('routing rules')),
  '@/components/placement/BucketPlacementSection.vue': moduleDefault(SectionStub('placement policies')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/DetailDialog.vue': moduleDefault(DetailDialogStub),
  '@/components/ui/DialogClose.vue': moduleDefault(Slotted('span')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('footer')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
})

async function open(props: Record<string, unknown>): Promise<HostNode> {
  const { root } = await mountApp(dialog, {
    props: { open: true, bucket: 'reef-survey', groupId: 'g-1', ...props },
  })
  return root
}

describe('bucket settings dialog', () => {
  it('holds routing and placement under one entry', async () => {
    const text = content(await open({ showRouting: true, showPlacement: true }))

    expect(text).toContain('Bucket settings for reef-survey')
    expect(text).toContain('Routing')
    expect(text).toContain("storage backend behind this node receives the bucket's writes")
    expect(text).toContain('Placement')
    expect(text).toContain("Where copies of this bucket's data are kept")
    expect(text).toContain('routing rules')
    expect(text).toContain('placement policies')
  })

  it('hides placement without the realm-admin gate', async () => {
    const text = content(await open({ showRouting: true, showPlacement: false }))

    expect(text).toContain('routing rules')
    expect(text).not.toContain('placement policies')
    expect(text).not.toContain("Where copies of this bucket's data are kept")
  })

  it('keeps a single section under the same entry', async () => {
    const text = content(await open({ showRouting: false, showPlacement: true }))

    expect(text).toContain('Bucket settings for reef-survey')
    expect(text).toContain('placement policies')
    expect(text).not.toContain('routing rules')
  })
})
