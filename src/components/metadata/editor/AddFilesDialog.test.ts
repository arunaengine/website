import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  element,
  flush,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as References from '@/lib/crate/references'
import * as ContentIdentity from '@/lib/contentIdentity'
import * as Uri from '@/lib/profiles/uri'
import * as Utils from '@/lib/utils'

// The identity of a picked object is decided once, in dataIdentity; here it is
// pinned to the two forms it answers with.
const BLAKE3 = 'a'.repeat(64)
let resolvable = true

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
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => h('input', {
    ...attrs,
    value: props.modelValue,
    onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
  }),
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
  '@/composables/useAruna': {
    useAruna: () => ({
      apiBaseUrl: ref('https://api.example.test'),
      authToken: ref('token'),
      nodeInfo: ref({ node: { realm_id: 'realm-1', peer_id: 'node-1' } }),
    }),
  },
  '@/composables/useS3': {
    useS3: () => ({
      listBuckets: async () => [{ name: 'reads' }],
      activeContext: ref({ groupId: 'group-1' }),
      headObject: async () => ({ versionId: '01VERSION', metadata: {} }),
    }),
    s3ErrorMessage: (error: unknown) => String(error),
  },
  '@/composables/useUploadQueue': { useUploadQueue: () => ({ items, enqueue }) },
  '@/lib/contentIdentity': ContentIdentity,
  '@/lib/crate/dataIdentity': {
    objectLocation: (bucket: string, key: string) => `s3://${bucket}/${key}`,
    dataEntityIdentity: async (bucket: string, key: string) => ({
      id: resolvable ? `https://w3id.org/aruna/data/${BLAKE3}` : `s3://${bucket}/${key}`,
      contentUrl: `s3://${bucket}/${key}`,
    }),
  },
  '@/lib/crate/references': References,
  '@/lib/crate/editor': Editor,
  '@/lib/profiles/uri': Uri,
  '@/lib/utils': Utils,
})

const ROOT_TARGET = { entityId: './', property: 'hasPart' }

function mount(updates: Editor.CrateDraft[], props: Record<string, unknown> = {}) {
  return mountApp(AddFilesDialog, {
    props: {
      open: true,
      draft: Editor.newDraft(),
      target: ROOT_TARGET,
      groupId: 'group-1',
      onUpdate: (next: Editor.CrateDraft) => updates.push(next),
      ...props,
    },
  })
}

beforeEach(() => {
  items.value = []
  counter = 0
  resolvable = true
  enqueue.mockClear()
})

describe('AddFilesDialog', () => {
  it('names a picked object by its content and its place by contentUrl', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount(updates)

    await click(button(mounted.root, 'Pick objects'))
    await flush()

    const file = Editor.findEntity(updates[0], `https://w3id.org/aruna/data/${BLAKE3}`)
    expect(file).toMatchObject({
      types: ['File'],
      properties: {
        name: [{ value: 'one.csv' }],
        contentUrl: [{ value: 's3://reads/raw/one.csv' }],
        encodingFormat: [{ value: 'text/csv' }],
        contentSize: [{ value: '2048' }],
      },
    })
    // A picked prefix has no content of its own, so it keeps its location.
    expect(Editor.findEntity(updates[0], 's3://reads/raw/nested/')?.types).toEqual(['Dataset'])
    expect([...Editor.partIds(updates[0])]).toEqual([
      `https://w3id.org/aruna/data/${BLAKE3}`,
      's3://reads/raw/nested/',
    ])
    mounted.app.unmount()
  })

  it('falls back to the location when the node cannot name the content', async () => {
    const updates: Editor.CrateDraft[] = []
    resolvable = false
    const mounted = await mount(updates)

    await click(button(mounted.root, 'Pick objects'))
    await flush()

    expect(Editor.findEntity(updates[0], 's3://reads/raw/one.csv')?.types).toEqual(['File'])
    mounted.app.unmount()
  })

  it('adds the part to the entity that asked for it', async () => {
    const updates: Editor.CrateDraft[] = []
    const draft = References.addFilePart(Editor.newDraft(), {
      id: 's3://reads/raw/',
      name: 'raw',
      type: 'Dataset',
    })
    const mounted = await mount(updates, {
      draft,
      target: { entityId: 's3://reads/raw/', property: 'hasPart' },
    })

    await click(button(mounted.root, 'Pick objects'))
    await flush()

    expect(Editor.findEntity(updates[0], 's3://reads/raw/')?.properties.hasPart).toEqual([
      { kind: 'reference', value: `https://w3id.org/aruna/data/${BLAKE3}` },
      { kind: 'reference', value: 's3://reads/raw/nested/' },
    ])
    expect(Editor.findEntity(updates[0], './')?.properties.hasPart).toEqual([
      { kind: 'reference', value: 's3://reads/raw/' },
    ])
    mounted.app.unmount()
  })

  it('links something already in the dataset without copying it', async () => {
    const updates: Editor.CrateDraft[] = []
    const draft = Editor.addEntity(Editor.newDraft(), {
      type: 'File',
      id: 's3://reads/stray.csv',
      name: 'stray.csv',
    }).draft
    const mounted = await mount(updates, { draft })

    await click(button(mounted.root, 'stray.csv'))

    expect(updates[0].entities).toHaveLength(2)
    expect(Editor.findEntity(updates[0], './')?.properties.hasPart).toEqual([
      { kind: 'reference', value: 's3://reads/stray.csv' },
    ])
    mounted.app.unmount()
  })

  it('records a file that lives outside this node by its address', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount(updates)
    const url = element(mounted.root, (node) => node.props['aria-label'] === 'External URL')

    await typeValue(url, 'https://example.org/reads.fastq.gz')
    await click(button(mounted.root, 'Add file'))

    expect(Editor.findEntity(updates[0], 'https://example.org/reads.fastq.gz')).toMatchObject({
      types: ['File'],
      properties: { name: [{ value: 'https://example.org/reads.fastq.gz' }] },
    })
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

    expect(Editor.findEntity(updates[0], `https://w3id.org/aruna/data/${BLAKE3}`)).toMatchObject({
      types: ['File'],
      properties: {
        contentUrl: [{ value: 's3://reads/two.json' }],
        encodingFormat: [{ value: 'application/json' }],
        contentSize: [{ value: '64' }],
      },
    })
    mounted.app.unmount()
  })
})
