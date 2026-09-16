import { computed, defineComponent, h, inject, provide, ref, type ComputedRef } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as assistantObject from '@/composables/useAssistantObject'
import * as StateBadge from '@/lib/stateBadge'
import * as NotebookDocument from '@/lib/notebook/document'
import * as Utils from '@/lib/utils'
import * as PublicAccessLib from '@/lib/publicAccess'
import * as SyncLib from '@/lib/sync'
import {
  button,
  click,
  compileClientComponent,
  content,
  flush,
  element,
  mountApp,
  moduleDefault,
  nodes,
} from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const DetailDialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () =>
    props.open ? h('div', [slots.header?.(), slots.default?.()]) : null,
})
const TabsStub = defineComponent({
  props: { modelValue: String },
  setup(props, { slots }) {
    provide('active-tab', computed(() => props.modelValue))
    return () => h('div', slots.default?.())
  },
})
const TabsContentStub = defineComponent({
  props: { value: String },
  setup(props, { slots }) {
    const active = inject<ComputedRef<string>>('active-tab')
    return () => (active?.value === props.value ? h('div', slots.default?.()) : null)
  },
})
const Marker = (text: string) => defineComponent({ setup: () => () => h('section', text) })
const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { variant: String, size: String, class: String },
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const headObject = vi.fn()
const hasActiveKey = ref(true)
const currentUser = ref<{ id: string } | null>({ id: 'u-1' })
const loadReferences = vi.fn()
const filePublic = ref(false)
const resetReferences = vi.fn()

const dialog = compileClientComponent(new URL('./FileDetailsDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  'vue-router': { RouterLink: defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { to: props.to, 'data-to': JSON.stringify(props.to) }, slots.default?.()) }) },
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/CopyButton.vue': moduleDefault(defineComponent({ props: { value: String }, setup: (props) => () => h('button', { 'data-copy': props.value }) })),
  '@/components/ui/DetailDialog.vue': moduleDefault(DetailDialogStub),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('i')),
  '@/components/ui/Tabs.vue': moduleDefault(TabsStub),
  '@/components/ui/TabsContent.vue': moduleDefault(TabsContentStub),
  '@/components/ui/TabsList.vue': moduleDefault(Slotted('div')),
  '@/components/ui/TabsTrigger.vue': moduleDefault(Slotted('button')),
  '@/components/data/ObjectLocationsPanel.vue': moduleDefault(Marker('copies of this version')),
  '@/components/data/ObjectVersionsPanel.vue': moduleDefault(Marker('version rows')),
  '@/components/data/ReferencedBy.vue': moduleDefault(Marker('referencing datasets')),
  '@/components/data/PublicAccessDialog.vue': moduleDefault(defineComponent({ props: { open: Boolean }, setup: (props) => () => (props.open ? h('section', 'public access dialog') : null) })),
  '@/components/storage/ObjectRulesEditor.vue': moduleDefault(Marker('edit rules for this file')),
  '@/components/storage/PolicyColumn.vue': moduleDefault(Marker('rules this file carries')),
  '@/components/preview/PreviewBody.vue': moduleDefault(defineComponent({ setup: (_, { slots }) => () => h('section', [slots.actions?.(), 'preview']) })),
  '@/composables/useS3': {
    useS3: () => ({ headObject, hasActiveKey }),
    s3ErrorMessage: (error: unknown) => String(error),
  },
  '@/composables/s3/endpoints': {
    nodeApiBase: (nodeId: string) => `https://${nodeId}/api/v1`,
    endpointForNode: () => 'https://s3.node-1.example',
  },
  '@/lib/publicAccess': PublicAccessLib,
  '@/lib/sync': SyncLib,
  '@/composables/useAruna': {
    useAruna: () => ({ currentUser, apiBaseUrl: ref('https://local/api/v1') }),
  },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: () => 'this node' }) },
  '@/composables/usePublicAccess': {
    usePublicAccess: () => ({ isPublic: () => filePublic.value, groupName: ref('Reef lab') }),
  },
  '@/composables/useBacklinks': {
    useBacklinks: () => ({
      result: ref(null),
      error: ref(null),
      busy: ref(false),
      load: loadReferences,
      reset: resetReferences,
    }),
  },
  '@/lib/backlinks': { exactFileBacklinkPreflight: (response: unknown) => response },
  '@/composables/useAssistantObject': assistantObject,
  '@/lib/config': { featureEnabled: () => true },
  '@/lib/notebook/document': NotebookDocument,
  '@/lib/stateBadge': StateBadge,
  '@/lib/utils': Utils,
})

async function mount(tab: string, overrides: Record<string, unknown> = {}) {
  headObject.mockResolvedValue({ contentType: 'text/plain', versionId: '01J000000000000000000HEAD' })
  loadReferences.mockClear()
  resetReferences.mockClear()
  const tabs: string[] = []
  const closed: boolean[] = []
  const host = defineComponent({
    setup: () => () =>
      h(dialog, {
        open: true,
        tab,
        bucket: 'reef-survey',
        objectKey: 'raw/reads.fastq',
        name: 'reads.fastq',
        nodeId: null,
        groupId: 'g-1',
        ...overrides,
        'onUpdate:tab': (value: string) => tabs.push(value),
        'onUpdate:open': (value: boolean) => closed.push(value),
      }),
  })
  const { root } = await mountApp(host)
  await flush()
  return { root, tabs, closed }
}

async function render(tab: string) {
  return content((await mount(tab)).root)
}

describe('file details storage tab', () => {
  it('loads the head once the S3 session arrives', async () => {
    // A deep link opens the dialog before the browser holds a session.
    hasActiveKey.value = false
    headObject.mockRejectedValueOnce(new Error('S3SessionUnavailableError: no session'))
    const { root } = await mount('general')
    expect(content(root)).toContain('S3SessionUnavailableError')

    hasActiveKey.value = true
    await flush()

    expect(content(root)).not.toContain('S3SessionUnavailableError')
    expect(content(root)).toContain('HEAD')
    expect(headObject).toHaveBeenCalledTimes(2)
  })

  it('puts the rules beside the copies of the chosen version', async () => {
    const text = await render('storage')

    expect(text).toContain('rules this file carries')
    expect(text).toContain('copies of this version')
    expect(text).toContain('edit rules for this file')
  })

  it('keeps the storage tab out of the other tabs', async () => {
    const text = await render('general')

    expect(text).not.toContain('rules this file carries')
    expect(text).not.toContain('copies of this version')
  })
})

describe('file details preview mode', () => {
  it('fills the dialog with the preview instead of a tab', async () => {
    const text = await render('preview')

    expect(text).toContain('preview')
    expect(text).not.toContain('Versions')
    expect(text).not.toContain('Storage')
  })

  it('switches between the preview and the details', async () => {
    const details = await mount('general')
    await click(button(details.root, 'Preview'))
    expect(details.tabs).toEqual(['preview'])

    const preview = await mount('preview')
    await click(button(preview.root, 'Details'))
    expect(preview.tabs).toEqual(['general'])
  })

  it('keeps the details tabs without a preview trigger', async () => {
    const text = await render('general')

    expect(text).toContain('General')
    expect(text).toContain('Versions')
    expect(text).not.toContain('preview')
  })
})

describe('notebook preview entry', () => {
  it.each(['preview', 'general'])('opens the notebook from %s in its bucket and group', async (tab) => {
    const { root, closed } = await mount(tab, { objectKey: 'notebooks/counts.IPYNB' })
    const link = element(root, (node) => node.tag === 'a' && content(node).includes('Open notebook'))
    expect(link.props.to).toEqual({
      name: 'notebook',
      params: { bucketId: 'reef-survey', key: 'notebooks/counts.IPYNB' },
      query: { group: 'g-1' },
    })
    await click(link)
    expect(closed).toEqual([])
  })

  it.each([
    { objectKey: 'reads.fastq' },
    { objectKey: 'counts.ipynb', nodeId: 'remote-node' },
    { objectKey: 'counts.ipynb', versionId: 'older-version' },
    { objectKey: 'counts.ipynb', groupId: null },
  ])('does not open unsupported or ambiguous notebook targets: %j', async (overrides) => {
    const { root } = await mount('preview', overrides)
    expect(content(root)).not.toContain('Open notebook')
  })
})

describe('file details references', () => {
  it('asks the node that holds the bucket which datasets reference the file', async () => {
    const local = await mount('general')
    expect(content(local.root)).toContain('referencing datasets')
    expect(loadReferences).toHaveBeenCalledWith(
      { target: { kind: 'bucket_prefix', bucket: 'reef-survey', prefix: 'raw/reads.fastq' } },
      'https://local/api/v1',
    )

    await mount('general', { nodeId: 'remote-node' })
    expect(loadReferences).toHaveBeenCalledWith(expect.anything(), 'https://remote-node/api/v1')
  })

  it('skips the lookup for a signed-out viewer', async () => {
    currentUser.value = null
    try {
      const { root } = await mount('general')
      expect(loadReferences).not.toHaveBeenCalled()
      expect(resetReferences).toHaveBeenCalled()
      expect(content(root)).not.toContain('referencing datasets')
    } finally {
      currentUser.value = { id: 'u-1' }
    }
  })
})

describe('file details public access', () => {
  it('shows the state and opens the public access dialog', async () => {
    filePublic.value = false
    const { root } = await mount('general')
    expect(content(root)).toContain('private')
    expect(content(root)).not.toContain('public access dialog')

    expect(nodes(root).some((node) => String(node.props['data-copy'] ?? '').startsWith('https://'))).toBe(false)

    await click(button(root, 'Access…'))

    expect(content(root)).toContain('public access dialog')
  })

  it('names a public file', async () => {
    filePublic.value = true
    try {
      const { root } = await mount('general')
      expect(content(root)).toContain('public')
      expect(content(root)).toContain('Access…')
      const copy = element(root, (node) => String(node.props['data-copy'] ?? '').startsWith('https://'))
      expect(copy.props['data-copy']).toBe('https://s3.node-1.example/reef-survey/raw/reads.fastq')
      expect(content(root)).toContain('https://s3.node-1.example/reef-survey/raw/reads.fastq')
    } finally {
      filePublic.value = false
    }
  })

  it('has no public access row without a group', async () => {
    const { root } = await mount('general', { groupId: null })
    expect(content(root)).not.toContain('Public access')
  })
})

describe('folder details', () => {
  it('shows only the general details of a folder', async () => {
    headObject.mockClear()
    loadReferences.mockClear()
    const { root } = await mount('general', { objectKey: 'raw/', name: 'raw/', folder: true })

    expect(content(root)).toContain('Folder')
    expect(content(root)).toContain('raw/')
    expect(content(root)).not.toContain('Versions')
    expect(content(root)).not.toContain('Preview')
    expect(content(root)).not.toContain('Current version')
    expect(content(root)).not.toContain('referencing datasets')
    expect(content(root)).toContain('Access…')
    expect(headObject).not.toHaveBeenCalled()
    expect(loadReferences).not.toHaveBeenCalled()
  })
})

describe('file details shared state and syncs', () => {
  it('uses the view state it is given, so the list badges follow a change', async () => {
    filePublic.value = false
    const shared = { isPublic: () => true, groupName: ref('Reef lab') }
    const { root } = await mount('general', { access: shared })

    expect(content(root)).toContain('public')
    expect(nodes(root).some((node) => String(node.props['data-copy'] ?? '').startsWith('https://'))).toBe(true)
  })

  it('lists the syncs that cover the key and links to their settings', async () => {
    const relationship = {
      id: 'sync-1',
      source: 'arn:aruna:realm-1:node-1:s3/reef-survey/raw',
      target: 'arn:aruna:realm-1:node-2:s3/reef-mirror/raw',
      state: 'enabled',
    }
    const { root } = await mount('general', {
      nodeId: null,
      syncs: [
        { relationship, direction: 'outgoing' },
        { relationship: { ...relationship, id: 'sync-2', source: 'arn:aruna:realm-1:node-3:s3/archive' }, direction: 'incoming' },
      ],
    })

    const text = content(root)
    expect(text).toContain('Sync')
    expect(text).toContain('To')
    expect(text).toContain('reef-mirror/raw')
    expect(text).toContain('From')
    expect(text).toContain('archive')
    expect(text).toContain('enabled')
    const link = element(root, (node) => node.tag === 'a' && content(node) === 'Manage syncs')
    expect(JSON.parse(String(link.props['data-to']))).toEqual({
      name: 'bucket-storage',
      params: { bucketId: 'reef-survey' },
      query: { tab: 'syncs', group: 'g-1' },
    })
  })

  it('has no sync section without a covering sync', async () => {
    const { root } = await mount('general')
    expect(content(root)).not.toContain('Manage syncs')
  })
})
