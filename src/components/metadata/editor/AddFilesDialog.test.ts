import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  flush,
  moduleDefault,
  mountApp,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as Utils from '@/lib/utils'

interface QueuedUpload {
  id: number
  bucket: string
  key: string
  name: string
  size: number
  state: string
  progress: number
}

const items = ref<QueuedUpload[]>([])
let counter = 0
const enqueue = vi.fn((files: Array<{ name: string; size: number }>, target: { bucket: string; prefix: string }) => {
  for (const file of files) {
    items.value = [...items.value, {
      id: ++counter,
      bucket: target.bucket,
      key: `${target.prefix}${file.name}`,
      name: file.name,
      size: file.size,
      state: 'uploading',
      progress: 0,
    }]
  }
})

const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  setup: (props, { attrs }) => () => h('input', { ...attrs, value: props.modelValue }),
})
const BrowserStub = defineComponent({
  emits: ['add'],
  setup: (_, { emit }) => () => h('button', {
    onClick: () => emit('add', {
      bucket: 'reads',
      objects: [{ key: 'raw/one.csv', name: 'one.csv', size: 2048 }],
      folders: [{ prefix: 'raw/nested/', name: 'nested' }],
    }),
  }, 'Pick objects'),
})
const UploadStub = defineComponent({
  emits: ['add'],
  setup: (_, { emit }) => () => h('button', {
    onClick: () => emit('add', [{ name: 'two.json', size: 64 }]),
  }, 'Pick files'),
})

const AddFilesDialog = compileClientComponent(new URL('./AddFilesDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Dialog.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Progress.vue': moduleDefault(EmptyStub),
  '@/components/ui/Select.vue': moduleDefault(EmptyStub),
  '@/components/ui/Tabs.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsList.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsContent.vue': moduleDefault(Passthrough),
  '@/components/data/ObjectBrowserPanel.vue': moduleDefault(BrowserStub),
  '@/components/data/add/UploadTab.vue': moduleDefault(UploadStub),
  '@/components/metadata/SubcratePickerDialog.vue': moduleDefault(EmptyStub),
  '@/composables/useAruna': { useAruna: () => ({ apiBaseUrl: ref('https://api.example.test') }) },
  '@/composables/useS3': {
    useS3: () => ({
      listBuckets: async () => [{ name: 'reads' }],
      activeContext: ref({ groupId: 'group-1' }),
    }),
    s3ErrorMessage: (error: unknown) => String(error),
  },
  '@/composables/useUploadQueue': { useUploadQueue: () => ({ items, enqueue }) },
  '@/lib/crate/editor': Editor,
  '@/lib/utils': Utils,
})

function mount(updates: Editor.CrateDraft[]) {
  return mountApp(AddFilesDialog, {
    props: {
      open: true,
      draft: Editor.newDraft(),
      groupId: 'group-1',
      onUpdate: (next: Editor.CrateDraft) => updates.push(next),
    },
  })
}

beforeEach(() => {
  items.value = []
  counter = 0
  enqueue.mockClear()
})

describe('AddFilesDialog', () => {
  it('turns picked objects into File parts of the dataset', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount(updates)

    await click(button(mounted.root, 'Pick objects'))

    const file = Editor.findEntity(updates[0], 's3://reads/raw/one.csv')
    expect(file).toMatchObject({
      types: ['File'],
      properties: {
        name: [{ value: 'one.csv' }],
        contentUrl: [{ value: 's3://reads/raw/one.csv' }],
        encodingFormat: [{ value: 'text/csv' }],
        contentSize: [{ value: '2048' }],
      },
    })
    expect(Editor.findEntity(updates[0], 's3://reads/raw/nested/')?.types).toEqual(['Dataset'])
    expect([...Editor.partIds(updates[0])]).toEqual([
      's3://reads/raw/one.csv',
      's3://reads/raw/nested/',
    ])
    mounted.app.unmount()
  })

  it('references an upload only once the node holds it', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount(updates)
    await flush()

    await click(button(mounted.root, 'Pick files'))
    expect(enqueue).toHaveBeenCalledWith(
      [{ name: 'two.json', size: 64 }],
      { bucket: 'reads', prefix: '', groupId: 'group-1' },
    )
    expect(updates).toHaveLength(0)

    items.value = items.value.map((item) => ({ ...item, state: 'done' }))
    await flush()

    expect(Editor.findEntity(updates[0], 's3://reads/two.json')).toMatchObject({
      types: ['File'],
      properties: { encodingFormat: [{ value: 'application/json' }], contentSize: [{ value: '64' }] },
    })
    mounted.app.unmount()
  })
})
