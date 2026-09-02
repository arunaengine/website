import { defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bubbleClick,
  button,
  click,
  content,
  element,
  flush,
  mountApp,
  nodes,
  type HostNode,
} from '@/test/clientRender'
import {
  fakeManager,
  listedFolder,
  listedObject,
  objectBrowser,
  resetS3Access,
  s3Access,
} from '@/test/dataManager'

const openDetails = vi.fn()
const download = vi.fn()
const requestDelete = vi.fn()
const push = vi.fn()

const browser = objectBrowser()

async function render(overrides: Record<string, unknown> = {}) {
  const manager = fakeManager({ openDetails, download, requestDelete, router: { push }, ...overrides })
  const host = defineComponent({ setup: () => () => h(browser, { manager }) })
  const { root } = await mountApp(host)
  return root
}

function checkbox(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.tag === 'input' && node.props['aria-label'] === label)
}

// The host tree has no DOM, so the change event carries the new state by hand.
async function tick(node: HostNode, checked: boolean) {
  Object.assign(node, { checked })
  const handler = node.props.onChange
  if (typeof handler === 'function') await handler({ target: node })
  await flush()
}

function action(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.props['aria-label'] === label)
}

describe('object browser row actions', () => {
  it('offers exactly preview, download, delete and more', async () => {
    const root = await render()
    const row = element(root, (node) => node.tag === 'tr' && content(node).includes('reads.fastq'))

    expect(
      nodes(row)
        .filter((node) => node.tag === 'button')
        .map((node) => String(node.props['aria-label'])),
    ).toEqual(['Preview', 'Download', 'Delete…', 'More about this file'])
    // Icon only: the label is the accessible name, not visible text.
    expect(content(action(root, 'Preview')).trim()).toBe('')
  })

  it('previews without opening the details tabs', async () => {
    openDetails.mockClear()
    const root = await render()

    await bubbleClick(action(root, 'Preview'))

    expect(openDetails).toHaveBeenCalledTimes(1)
    expect(openDetails).toHaveBeenCalledWith(listedObject, 'preview')
  })

  it('starts the download from the row', async () => {
    download.mockClear()
    const root = await render()

    await bubbleClick(action(root, 'Download'))

    expect(download).toHaveBeenCalledWith(listedObject)
  })

  it('asks the delete dialog for this object', async () => {
    requestDelete.mockClear()
    openDetails.mockClear()
    const root = await render()

    await bubbleClick(action(root, 'Delete…'))

    expect(openDetails).not.toHaveBeenCalled()
    expect(requestDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'object',
        bucket: 'reef',
        key: listedObject.key,
        headState: 'live',
      }),
    )
  })

  it('opens the details on the general tab from more', async () => {
    openDetails.mockClear()
    const root = await render()

    await bubbleClick(action(root, 'More about this file'))

    expect(openDetails).toHaveBeenCalledWith(listedObject)
  })
})

describe('object browser toolbar', () => {
  it('opens the bucket settings from one labelled icon', async () => {
    push.mockClear()
    const root = await render()
    const settings = action(root, 'Bucket settings')

    expect(content(settings).trim()).toBe('')
    await bubbleClick(settings)

    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'bucket-storage', params: { bucketId: 'reef' } }),
    )
  })
})

describe('object browser selection', () => {
  afterEach(() => resetS3Access())

  it('offers a labelled checkbox on every folder row', async () => {
    const root = await render({ folders: ref([listedFolder]) })
    const box = checkbox(root, 'Select genomes')

    expect(box.props.type).toBe('checkbox')
    expect(box.props.disabled).toBe(false)
    // Icon-free control: the label is the accessible name, not visible text.
    expect(content(box).trim()).toBe('')
  })

  it('sends the ticked folders and files to the delete dialog', async () => {
    requestDelete.mockClear()
    const root = await render({ folders: ref([listedFolder]) })

    await tick(checkbox(root, 'Select genomes'), true)
    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    const trigger = button(root, 'Delete selected')

    expect(content(trigger)).toContain('Delete selected (2)')
    expect(trigger.props.disabled).toBe(false)
    await click(trigger)

    expect(requestDelete).toHaveBeenCalledWith({
      kind: 'selection',
      bucket: 'reef',
      nodeId: null,
      keys: [listedObject.key],
      prefixes: [listedFolder.prefix],
    })
  })

  it('refuses to tick a folder this session cannot delete', async () => {
    s3Access.canDeletePrefix = () => false
    const root = await render({ folders: ref([listedFolder]) })
    const box = checkbox(root, 'Select genomes')

    expect(box.props.disabled).toBe(true)
    expect(box.props.title).toContain('cannot delete this entire folder')
  })

  it('keeps the selection button disabled while nothing is ticked', async () => {
    const root = await render({ folders: ref([listedFolder]) })
    const trigger = button(root, 'Delete selected')

    expect(content(trigger)).toContain('Delete selected (0)')
    expect(trigger.props.disabled).toBe(true)
  })
})
