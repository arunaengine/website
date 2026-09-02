import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import * as DropEntries from '@/lib/upload/dropEntries'
import * as Pickers from '@/lib/upload/pickers'
import {
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  nodes,
  type HostNode,
} from '@/test/clientRender'

const Empty = defineComponent(() => () => null)
const icons = new Proxy({}, { get: () => Empty })
const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const UploadTab = compileClientComponent(new URL('./UploadTab.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(ButtonStub),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Passthrough),
  '@/lib/connectivity': {
    OFFLINE_WRITE_HINT: 'offline',
    useConnectivity: () => ({ writesDisabled: ref(false) }),
  },
  '@/lib/upload/dropEntries': DropEntries,
  '@/lib/upload/pickers': Pickers,
})

async function render(): Promise<{ root: HostNode; added: File[][] }> {
  const added: File[][] = []
  const host = defineComponent({
    setup: () => () => h(UploadTab, { onAdd: (files: File[]) => added.push(files) }),
  })
  const { root } = await mountApp(host)
  return { root, added }
}

function browseButtons(root: HostNode): HostNode[] {
  return nodes(root).filter(
    (node) => node.tag === 'button' && content(node).trim().startsWith('Browse'),
  )
}

function fileEntry(name: string): FileSystemEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (resolve: (file: File) => void) => resolve(new File(['x'], name)),
  } as unknown as FileSystemEntry
}

function folderEntry(name: string, children: FileSystemEntry[]): FileSystemEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader() {
      let index = 0
      return {
        readEntries: (resolve: (entries: FileSystemEntry[]) => void) =>
          resolve(index++ === 0 ? children : []),
      }
    },
  } as unknown as FileSystemEntry
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'showOpenFilePicker')
  Reflect.deleteProperty(globalThis, 'showDirectoryPicker')
})

describe('upload tab', () => {
  it('offers one Browse control, not one per source', async () => {
    const { root } = await render()

    expect(browseButtons(root)).toHaveLength(1)
    expect(content(root)).not.toContain('Browse files')
    expect(content(root)).not.toContain('Browse folder')
  })

  it('offers files or a folder where the pickers exist', async () => {
    const picked = new File(['x'], 'scan.tif')
    Object.assign(globalThis, {
      showOpenFilePicker: () => Promise.resolve([{ kind: 'file', name: 'scan.tif', getFile: () => Promise.resolve(picked) }]),
      showDirectoryPicker: () => Promise.resolve({ kind: 'directory', name: 'reef', values: () => [] }),
    })
    const { root, added } = await render()

    expect(browseButtons(root)).toHaveLength(1)
    const items = nodes(root).filter(
      (node) => node.tag === 'button' && ['Files', 'Folder'].includes(content(node).trim()),
    )
    expect(items).toHaveLength(2)

    await (items[0].props.onClick as (event: unknown) => Promise<void>)({})
    await flush()

    expect(added).toEqual([[picked]])
  })

  it('adds a dropped folder as files that keep their paths', async () => {
    const { root, added } = await render()
    const zone = element(root, (node) => typeof node.props.onDrop === 'function')

    await (zone.props.onDrop as (event: unknown) => Promise<void>)({
      preventDefault: () => {},
      dataTransfer: {
        items: [{ kind: 'file', webkitGetAsEntry: () => folderEntry('reef', [fileEntry('scan.tif')]) }],
        files: [],
      },
    })
    await flush()

    expect(added.map((files) => files.map((file) => file.webkitRelativePath))).toEqual([
      ['reef/scan.tif'],
    ])
  })
})
