import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import { button, click, compileClientComponent, content, mountApp, moduleDefault, nodes } from '@/test/clientRender'
import type { DistributedBucket } from '@/lib/distribution'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
// The dialog stands in with one button that reports a deletion the node took.
const DialogStub = defineComponent({ emits: ['changed'], setup: (_, { emit }) => () => h('button', { onClick: () => emit('changed') }, 'Confirm') })

const section = compileClientComponent(new URL('./SetDeleteSection.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/distributed/DeletionNotice.vue': moduleDefault(Slotted('aside')),
  '@/components/distributed/SetDeleteDialog.vue': moduleDefault(DialogStub),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@lucide/vue': { Trash2: Slotted('i') },
})

const bucket = { name: 'spire', preset: 'mirror', members: [], ranges: [], live: { deletion: null } } as unknown as DistributedBucket

describe('set delete section', () => {
  it('says the bucket is being deleted as soon as the node took the deletion', async () => {
    const changed: unknown[] = []
    const { root } = await mountApp(section, { props: { bucket, admin: true, onChanged: () => changed.push(true) } })
    await click(button(root, 'Confirm'))

    expect(changed).toEqual([true])
    expect(content(root)).toContain('Writes have stopped. Every node deletes its bucket, which can take a minute.')
    expect(nodes(root).some((node) => node.tag === 'button' && content(node).includes('Delete bucket'))).toBe(false)
  })
})
