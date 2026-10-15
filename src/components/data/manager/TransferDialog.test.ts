import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as DeletionRequest from '@/lib/deletion/request'
import * as ObjectMove from '@/lib/objectMove'
import { button, click, compileClientComponent, mountApp, moduleDefault } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean },
  setup: (props, { attrs, slots }) => () => h('button', { ...attrs, disabled: props.disabled }, slots.default?.()),
})

const writesDisabled = ref(false)
const s3 = {
  canWritePrefix: () => true,
  listObjectsRecursive: vi.fn(),
  copyObject: vi.fn(async () => undefined),
  deleteObject: vi.fn(),
  deletePrefix: vi.fn(),
}

const dialog = compileClientComponent(new URL('./TransferDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogClose.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/Input.vue': moduleDefault(Slotted('input')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/composables/useS3': { useS3: () => s3, s3ErrorMessage: (err: Error) => err.message },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled }) },
  '@/lib/deletion/request': DeletionRequest,
  '@/lib/objectMove': ObjectMove,
})

const sources = [{ key: 'raw/a.txt', folder: false }]

async function open() {
  const { root } = await mountApp(dialog, {
    props: { open: true, mode: 'copy', bucket: 'reef', prefix: 'raw/', nodeId: null, sources },
  })
  return root
}

describe('transfer dialog', () => {
  it('offers the copy online and blocks it offline', async () => {
    expect(button(await open(), 'Copy').props.disabled).toBe(false)

    writesDisabled.value = true
    try {
      const root = await open()
      expect(button(root, 'Copy').props.disabled).toBe(true)
      expect(button(root, 'Copy').props.title).toBe('offline')
      await click(button(root, 'Copy'))
      expect(s3.copyObject).not.toHaveBeenCalled()
    } finally {
      writesDisabled.value = false
    }
  })
})
