import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Utils from '@/lib/utils'
import * as StateBadge from '@/lib/stateBadge'
import * as DeletionOptions from '@/lib/deletion/options'
import * as ObjectVersions from '@/lib/objectVersions'
import {
  click,
  compileClientComponent,
  content,
  element,
  flush,
  mountApp,
  moduleDefault,
  nodes,
  type HostNode,
} from '@/test/clientRender'

const listObjectVersions = vi.fn()
const deleteObjectVersion = vi.fn(async () => undefined)
const canWrite = vi.fn(() => true)

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const slotted = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()),
  })
const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { variant: String, size: String, disabled: Boolean, title: String },
  setup: (props, { attrs, slots }) => () =>
    h('button', { ...attrs, disabled: props.disabled, title: props.title }, slots.default?.()),
})
const IconButtonStub = defineComponent({
  inheritAttrs: false,
  props: { label: String, disabledReason: String, class: String },
  setup: (props, { attrs, slots }) => () =>
    h(
      'button',
      { ...attrs, 'aria-label': props.label, disabled: Boolean(props.disabledReason) },
      slots.default?.(),
    ),
})

const panel = compileClientComponent(new URL('./ObjectVersionsPanel.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/lib/utils': Utils,
  '@/lib/stateBadge': StateBadge,
  '@/lib/deletion/options': DeletionOptions,
  '@/lib/objectVersions': ObjectVersions,
  '@/composables/useS3': {
    s3ErrorMessage: (error: unknown) => String(error),
    useS3: () => ({ listObjectVersions, deleteObjectVersion, canWrite, downloadUrl: async () => 'url' }),
  },
  '@/components/ui/Badge.vue': moduleDefault(slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/CopyButton.vue': moduleDefault(
    defineComponent({ props: { value: String, label: String }, setup: () => () => h('button', 'copy') }),
  ),
  '@/components/ui/EmptyState.vue': moduleDefault(
    defineComponent({ props: { title: String, compact: Boolean }, setup: (props) => () => h('p', props.title) }),
  ),
  '@/components/ui/ErrorPanel.vue': moduleDefault(
    defineComponent({ props: { message: String }, setup: (props) => () => h('p', props.message) }),
  ),
  '@/components/ui/IconButton.vue': moduleDefault(IconButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(slotted('aside')),
  '@/components/ui/RefusalNote.vue': moduleDefault(
    defineComponent({ props: { message: String, tone: String }, setup: (props) => () => h('p', props.message) }),
  ),
  '@/components/ui/Spinner.vue': moduleDefault(
    defineComponent({ props: { label: String, showLabel: Boolean, class: String }, setup: () => () => h('span') }),
  ),
})

const marker = {
  key: 'a.txt',
  versionId: '01MARKER0000',
  isLatest: true,
  deleteMarker: true,
  lastModified: new Date('2026-03-01T00:00:00Z'),
}
const current = {
  key: 'a.txt',
  versionId: '01CURRENT000',
  isLatest: true,
  deleteMarker: false,
  size: 2048,
  lastModified: new Date('2026-02-01T00:00:00Z'),
}
const older = {
  key: 'a.txt',
  versionId: '01OLDER00000',
  isLatest: false,
  deleteMarker: false,
  size: 1024,
  lastModified: new Date('2026-01-01T00:00:00Z'),
}

async function render(versions: unknown[], nodeId: string | null = null) {
  listObjectVersions.mockResolvedValue({ versions, truncated: false })
  const requests: unknown[] = []
  const host = defineComponent({
    setup: () => () =>
      h(panel, {
        active: true,
        bucket: 'reef',
        objectKey: 'a.txt',
        nodeId,
        onDelete: (request: unknown) => requests.push(request),
      }),
  })
  const { root } = await mountApp(host)
  return { root, requests }
}

function actions(root: HostNode): string[] {
  return nodes(root)
    .filter((node) => node.tag === 'button')
    .map((node) => String(node.props['aria-label'] ?? content(node).trim()))
}

describe('object versions panel', () => {
  it('names each row by its place in the history', async () => {
    const { root } = await render([current, older])
    const text = content(root)

    expect(text).toContain('Current')
    expect(text).toContain('Older')
    expect(text).toContain('2 KB')
  })

  it('offers no bytes actions on a delete marker', async () => {
    const { root } = await render([marker, older])

    expect(content(root)).toContain('Delete marker')
    // One preview and one download, both from the older stored version.
    expect(actions(root).filter((label) => label === 'Preview this version')).toHaveLength(1)
    expect(actions(root).filter((label) => label === 'Download this version')).toHaveLength(1)
    expect(actions(root)).toContain('Restore')
  })

  it('restores by deleting the head marker', async () => {
    deleteObjectVersion.mockClear()
    const { root } = await render([marker, older])

    await click(element(root, (node) => node.tag === 'button' && content(node).trim() === 'Restore'))

    expect(deleteObjectVersion).toHaveBeenCalledWith('reef', 'a.txt', '01MARKER0000', null)
  })

  it('asks the dialog for the outcome each button means', async () => {
    const { root, requests } = await render([current, older])

    await click(element(root, (node) => node.tag === 'button' && content(node).trim() === 'Make current'))
    await click(
      element(root, (node) => node.props['aria-label'] === 'Delete this version…'),
    )

    expect(requests).toEqual([
      expect.objectContaining({ option: 'make-current', versionId: '01OLDER00000', isCurrent: false }),
      expect.objectContaining({ option: 'delete-version', versionId: '01CURRENT000', isCurrent: true }),
    ])
  })

  it('reloads when the parent bumps the revision', async () => {
    listObjectVersions.mockClear()
    listObjectVersions.mockResolvedValue({ versions: [current, older], truncated: false })
    const revision = ref(0)
    const host = defineComponent({
      setup: () => () =>
        h(panel, { active: true, bucket: 'reef', objectKey: 'a.txt', nodeId: null, revision: revision.value }),
    })
    const { root } = await mountApp(host)
    expect(listObjectVersions).toHaveBeenCalledTimes(1)

    listObjectVersions.mockResolvedValue({ versions: [marker, older], truncated: false })
    revision.value += 1
    await flush()

    expect(listObjectVersions).toHaveBeenCalledTimes(2)
    expect(content(root)).toContain('Delete marker')
  })

  it('says why a bucket on another node has no version list', async () => {
    listObjectVersions.mockClear()
    const { root } = await render([current], 'node-b')

    expect(content(root)).toContain('served by another node')
    expect(listObjectVersions).not.toHaveBeenCalled()
  })
})
