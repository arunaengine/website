import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, content, mountApp, moduleDefault } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const uploads = ref<unknown[]>([])

const view = compileClientComponent(new URL('./VisitUpload.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': { CircleCheck: Slotted('i'), CircleX: Slotted('i'), Upload: Slotted('i') },
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Progress.vue': moduleDefault(Slotted('progress')),
  '@/composables/useVisitUploads': { useVisitUploads: () => ({ uploads, add: async () => {} }) },
  '@/lib/upload/dropEntries': { collectDropFiles: async () => [] },
  '@/lib/utils': { formatBytes: (bytes: number) => `${bytes} B` },
})

describe('visitor upload', () => {
  it('names a finished file as sent, never as still waiting', async () => {
    uploads.value = [
      { id: 1, name: 'visitor-note.txt', size: 20, sent: 20, state: 'done', landed: 'visitor-note.txt' },
      { id: 2, name: 'next.txt', size: 5, sent: 0, state: 'waiting' },
    ]
    const { root } = await mountApp(view, { props: { visit: async () => undefined, prefix: '', uploadOnly: true } })
    const text = content(root)

    expect(text.match(/Waiting/g)).toHaveLength(1)
    expect(text).toContain('Files sent: 1, 20 B')
  })
})
