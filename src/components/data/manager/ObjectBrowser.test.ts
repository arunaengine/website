import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  bubbleClick,
  content,
  element,
  mountApp,
  nodes,
  type HostNode,
} from '@/test/clientRender'
import { fakeManager, listedObject, objectBrowser } from '@/test/dataManager'

const openDetails = vi.fn()
const download = vi.fn()
const requestDelete = vi.fn()
const push = vi.fn()

const browser = objectBrowser()

async function render() {
  const manager = fakeManager({ openDetails, download, requestDelete, router: { push } })
  const host = defineComponent({ setup: () => () => h(browser, { manager }) })
  const { root } = await mountApp(host)
  return root
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
