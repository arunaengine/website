import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as SearchGroups from '@/lib/searchGroups'
import * as TableImport from '@/lib/tableImport'
import { click, compileClientComponent, content, element, flush, mountApp, moduleDefault, nodes, type HostNode } from '@/test/clientRender'

// A found file shows its name and folder apart; its full key stays in the title.
const shown = (root: HostNode, key: string) => nodes(root).some((node) => node.props.title === key)
// The expand button stops its click from reaching the row, as a browser event allows.
async function expand(root: HostNode) {
  ;(element(root, (node) => node.props['aria-expanded'] !== undefined).props.onClick as (event: unknown) => void)({ stopPropagation: () => {} })
  await flush()
}

const hit = { key: 'GCF_000005845.2_ASM584v2/', bucket: 'ncbi', issuer_node_id: 'n2', group_id: 'g1' }
const searchObjects = vi.fn(async (_q: string, _options: { match: string }) => ({ hits: [hit] as unknown[], next_cursor: null as string | null, coverage: { complete: true } }))

// Searching while typing waits for a pause; it is over at once unless a test holds it.
let held: (() => void) | null = null
let holding = false
const useDebounceFn = (fn: () => void) => Object.assign(() => (holding ? (held = fn) : fn()), { cancel: () => (held = null) })


// The list bar's box and Enter, as the file list drives the search: the box holds the text,
// submitting it searches again.
const view = compileClientComponent(new URL('./MetadataSearch.vue', import.meta.url), {
  vue: VueRuntime,
  '@vueuse/core': { useDebounceFn },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  '@/components/ui/Button.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })),
  '@/composables/useAruna': { useAruna: () => ({ searchObjects, sessionEpoch: ref(1) }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => `node ${id}`, isLocalNode: (id: string) => id === 'n1' }) },
  '@/lib/searchGroups': SearchGroups,
  '@/lib/tableImport': TableImport,
  '@/lib/utils': { errorMessage: (cause: unknown) => String(cause), formatBytes: (bytes: number) => `${bytes} B` },
  '@/components/data/ObjectIcon.vue': moduleDefault(defineComponent(() => () => h('i'))),
})
const component = defineComponent({
  props: { bucket: String, nodeId: { type: String, default: null }, onOpen: Function, onBack: Function },
  setup(props) {
    const text = ref('')
    const search = ref<{ search: () => Promise<void> } | null>(null)
    return () =>
      h('div', [
        h('form', { onSubmit: (event: Event) => { event.preventDefault(); void search.value?.search() } }, [
          h('input', { value: text.value, 'onUpdate:modelValue': (value: string) => (text.value = value) }),
        ]),
        h(view, { ref: search, bucket: props.bucket, nodeId: props.nodeId, text: text.value, 'onUpdate:text': (value: string) => (text.value = value), onOpen: props.onOpen, onBack: props.onBack }),
      ])
  },
})

describe('bucket metadata search', () => {
  it('turns column=value into a chip and searches the bucket metadata', async () => {
    const opened: unknown[] = []
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null, onOpen: (found: unknown) => opened.push(found) } })
    const box = element(root, (node) => node.tag === 'input')
    ;(box.props['onUpdate:modelValue'] as (value: string) => void)('coli species_taxid=562')
    await flush()
    ;(element(root, (node) => node.tag === 'form').props.onSubmit as (event: Event) => void)({ preventDefault: () => {} } as Event)
    await flush()

    expect(searchObjects).toHaveBeenCalledWith('coli species_taxid=562', { bucket: 'ncbi', match: 'metadata', limit: 50, cursor: undefined })
    expect(content(root)).toContain('species_taxid = 562')
    ;(element(root, (node) => node.tag === 'tr' && content(node).includes('GCF_')).props.onClick as () => void)()
    expect(content(root)).toContain('on node n2')
    expect(opened).toEqual([hit])
  })

  it('drops an answer that arrives after the bucket changed', async () => {
    let answer: (value: unknown) => void = () => {}
    searchObjects.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)) as never)
    const { root, app } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    ;(element(root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('coli')
    await flush()
    ;(element(root, (node) => node.tag === 'form').props.onSubmit as (event: Event) => void)({ preventDefault: () => {} } as Event)
    await flush()

    const vm = app._instance!
    ;(vm.props as { bucket: string }).bucket = 'other'
    await flush()
    answer({ hits: [hit], next_cursor: 'c2', coverage: { complete: true } })
    await flush()
    expect(content(root)).not.toContain('GCF_')
    expect(content(root)).not.toContain('Show more')
  })

  it('keeps a quoted value with a space whole', async () => {
    searchObjects.mockClear()
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    const input = () => element(root, (node) => node.tag === 'input')
    ;(input().props['onUpdate:modelValue'] as (value: string) => void)('assembly_level="Complete')
    await flush()
    // An open quote does not search while typing.
    expect(searchObjects).not.toHaveBeenCalled()
    expect(content(root)).not.toContain('assembly_level =')

    ;(input().props['onUpdate:modelValue'] as (value: string) => void)('assembly_level="Complete Genome"')
    await flush()
    ;(element(root, (node) => node.tag === 'form').props.onSubmit as (event: Event) => void)({ preventDefault: () => {} } as Event)
    await flush()
    expect(content(root)).toContain('assembly_level = Complete Genome')
    expect(searchObjects).toHaveBeenLastCalledWith('assembly_level="Complete Genome"', expect.objectContaining({ match: 'metadata' }))
  })

  it('finds file names while typing and keeps one hit per file', async () => {
    const file = { key: 'reads/ui-hello.txt', bucket: 'ncbi', issuer_node_id: 'n1', group_id: 'g1' }
    searchObjects.mockReset()
    searchObjects.mockImplementation(async (_q: string, options: { match: string }) =>
      ({ hits: options.match === 'substring' ? [file] : [file, hit], next_cursor: null, coverage: { complete: true } }))
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    ;(element(root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('hello')
    await flush()

    expect(searchObjects).toHaveBeenCalledWith('hello', { bucket: 'ncbi', match: 'substring', limit: 50 })
    expect(searchObjects).toHaveBeenCalledWith('hello', expect.objectContaining({ match: 'metadata' }))
    expect(nodes(root).filter((node) => node.props.title === 'reads/ui-hello.txt')).toHaveLength(1)
    expect(content(root)).toContain('GCF_')
  })

  it('keeps a failed name search from reading as nothing found', async () => {
    searchObjects.mockReset()
    searchObjects.mockImplementation(async (_q: string, options: { match: string }) => {
      if (options.match === 'substring') throw new Error('down')
      return { hits: [], next_cursor: null, coverage: { complete: true } }
    })
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    ;(element(root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('hello')
    await flush()

    expect(content(root)).not.toContain('Nothing matches.')
    expect(content(root)).toContain('The name search failed')
  })

  it('pages name matches past the first page and keeps partial coverage', async () => {
    const named = (key: string) => ({ key, bucket: 'ncbi', issuer_node_id: 'n1', group_id: 'g1' })
    searchObjects.mockReset()
    searchObjects.mockImplementation(async (_q: string, options: { match: string; cursor?: string }) => {
      if (options.match === 'metadata') return { hits: [], next_cursor: null, coverage: { complete: true } }
      return options.cursor === 'n2'
        ? { hits: [named('b/second.txt')], next_cursor: null, coverage: { complete: true } }
        : { hits: [named('a/first.txt')], next_cursor: 'n2', coverage: { complete: false } }
    })
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    ;(element(root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('hello')
    await flush()
    ;(element(root, (node) => node.tag === 'button' && content(node) === 'Show more').props.onClick as () => void)()
    await flush()

    expect(searchObjects).toHaveBeenLastCalledWith('hello', { bucket: 'ncbi', match: 'substring', limit: 50, cursor: 'n2' })
    expect(shown(root, 'a/first.txt')).toBe(true)
    expect(shown(root, 'b/second.txt')).toBe(true)
    expect(content(root)).toContain('Some parts of this bucket could not be searched')
    expect(content(root)).not.toContain('Show more')
  })

  it('keeps a failed first name page through details paging and asks for it again', async () => {
    const named = { key: 'reads/hello.txt', bucket: 'ncbi', issuer_node_id: 'n1', group_id: 'g1' }
    let nameAnswers = 0
    searchObjects.mockReset()
    searchObjects.mockImplementation(async (_q: string, options: { match: string; cursor?: string }) => {
      if (options.match === 'metadata') return { hits: [], next_cursor: options.cursor ? null : 'd2', coverage: { complete: true } }
      nameAnswers += 1
      if (nameAnswers < 2) throw new Error('down')
      return { hits: [named], next_cursor: null, coverage: { complete: true } }
    })
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    ;(element(root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('hello')
    await flush()
    const more = () => (element(root, (node) => node.tag === 'button' && content(node) === 'Show more').props.onClick as () => void)()

    // The empty details page with a cursor was followed at once, without asking the failed names again.
    expect(searchObjects).toHaveBeenLastCalledWith('hello', { bucket: 'ncbi', match: 'metadata', limit: 50, cursor: 'd2' })
    expect(nameAnswers).toBe(1)
    expect(content(root)).toContain('The name search failed')
    expect(content(root)).not.toContain('Nothing matches.')

    more()
    await flush()
    expect(searchObjects).toHaveBeenLastCalledWith('hello', { bucket: 'ncbi', match: 'substring', limit: 50, cursor: undefined })
    expect(shown(root, 'reads/hello.txt')).toBe(true)
    expect(content(root)).not.toContain('The name search failed')
    expect(content(root)).not.toContain('Show more')
  })

  it('follows an empty page with a cursor until a hit arrives, showing it still searches', async () => {
    const strain = { key: 'GCF_000006665.1_ASM666v1/', bucket: 'ncbi-refseq', issuer_node_id: 'n2', group_id: 'g1' }
    let second!: (value: unknown) => void
    searchObjects.mockReset()
    searchObjects.mockImplementation(async (_q: string, options: { match: string; cursor?: string }) => {
      if (options.match === 'substring') return { hits: [], next_cursor: null, coverage: { complete: true } }
      if (!options.cursor) return { hits: [], next_cursor: 'c2', coverage: { complete: true } }
      return new Promise((resolve) => (second = resolve)) as never
    })
    const { root } = await mountApp(component, { props: { bucket: 'ncbi-refseq', nodeId: null } })
    ;(element(root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('SAMN02905113')
    await flush()

    expect(searchObjects).toHaveBeenLastCalledWith('SAMN02905113', { bucket: 'ncbi-refseq', match: 'metadata', limit: 50, cursor: 'c2' })
    expect(content(root)).toContain('Searching…')
    expect(content(root)).not.toContain('Nothing matches.')

    second({ hits: [strain], next_cursor: null, coverage: { complete: true } })
    await flush()
    await flush()
    expect(shown(root, 'GCF_000006665.1_ASM666v1/')).toBe(true)
    expect(content(root)).not.toContain('Searching…')
  })

  it('stops following cursors once a newer search starts', async () => {
    searchObjects.mockReset()
    searchObjects.mockImplementation(async (q: string, options: { match: string; cursor?: string }) => {
      if (options.match === 'substring') return { hits: [], next_cursor: null, coverage: { complete: true } }
      // The first term never finds anything and always has another page.
      if (q === 'never') return { hits: [], next_cursor: `${options.cursor ?? ''}x`, coverage: { complete: true } }
      return { hits: [hit], next_cursor: null, coverage: { complete: true } }
    })
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    const input = element(root, (node) => node.tag === 'input')
    ;(input.props['onUpdate:modelValue'] as (value: string) => void)('never')
    await flush()
    ;(input.props['onUpdate:modelValue'] as (value: string) => void)('coli')
    await flush()
    const calls = searchObjects.mock.calls.length
    await flush()

    expect(content(root)).toContain('GCF_')
    expect(searchObjects.mock.calls.length).toBe(calls)
  })

  it('stops following once a later name page fails', async () => {
    searchObjects.mockReset()
    searchObjects.mockImplementation(async (_q: string, options: { match: string; cursor?: string }) => {
      if (options.match === 'metadata') return { hits: [], next_cursor: null, coverage: { complete: true } }
      if (options.cursor) throw new Error('name search down')
      return { hits: [], next_cursor: 'n2', coverage: { complete: true } }
    })
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    ;(element(root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('rare')
    await flush()
    await flush()

    expect(searchObjects).toHaveBeenCalledTimes(3)
    expect(content(root)).toContain('The name search failed')
    expect(content(root)).not.toContain('Searching')
  })

  it('starts no search after leaving while a typed search still waits', async () => {
    searchObjects.mockReset()
    holding = true
    const { app, root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    ;(element(root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('coli')
    await flush()
    expect(held).not.toBeNull()
    app.unmount()
    held?.()
    holding = false
    await flush()

    expect(searchObjects).not.toHaveBeenCalled()
  })

  it('ends a running search and its paging as soon as the words change', async () => {
    let answer: (value: unknown) => void = () => {}
    searchObjects.mockReset()
    searchObjects.mockImplementation(async (_q: string, options: { match: string; cursor?: string }) => {
      if (options.match === 'metadata') return { hits: [], next_cursor: null, coverage: { complete: true } }
      if (!options.cursor) return { hits: [], next_cursor: 'n2', coverage: { complete: true } }
      return new Promise((resolve) => (answer = resolve)) as never
    })
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    const input = element(root, (node) => node.tag === 'input')
    ;(input.props['onUpdate:modelValue'] as (value: string) => void)('coli')
    await flush()
    expect(content(root)).toContain('Searching…')

    ;(input.props['onUpdate:modelValue'] as (value: string) => void)('')
    await flush()
    answer({ hits: [hit], next_cursor: 'n3', coverage: { complete: true } })
    await flush()

    expect(content(root)).not.toContain('Searching…')
    expect(content(root)).not.toContain('GCF_')
    expect(content(root)).not.toContain('Show more')
    expect(searchObjects).toHaveBeenCalledTimes(3)
  })

  it('drops the search of a chip removed before its answer', async () => {
    let answer: (value: unknown) => void = () => {}
    searchObjects.mockReset()
    searchObjects.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)) as never)
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    ;(element(root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('species_taxid=562')
    await flush()
    ;(element(root, (node) => node.tag === 'form').props.onSubmit as (event: Event) => void)({ preventDefault: () => {} } as Event)
    await flush()
    expect(content(root)).toContain('Searching…')

    ;(element(root, (node) => node.props['aria-label'] === 'Remove species_taxid').props.onClick as () => void)()
    answer({ hits: [hit], next_cursor: 'c2', coverage: { complete: true } })
    await flush()

    expect(content(root)).not.toContain('GCF_')
    expect(content(root)).not.toContain('Searching…')
    expect(content(root)).not.toContain('Show more')
    expect(searchObjects).toHaveBeenCalledOnce()
  })

  it('starts a new query after a search of a chip alone, and keeps a chip searched with words', async () => {
    searchObjects.mockClear()
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    const type = async (value: string) => {
      ;(element(root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)(value)
      await flush()
      ;(element(root, (node) => node.tag === 'form').props.onSubmit as (event: Event) => void)({ preventDefault: () => {} } as Event)
      await flush()
    }
    await type('species_taxid=562')
    await type('GCF_000006765')
    expect(searchObjects).toHaveBeenCalledWith('GCF_000006765', expect.objectContaining({ match: 'metadata' }))
    expect(content(root)).not.toContain('species_taxid = 562')

    await type('coli species_taxid=562')
    await type('coli k12')
    expect(searchObjects).toHaveBeenCalledWith('coli k12 species_taxid=562', expect.objectContaining({ match: 'metadata' }))
  })

  it('searches with the box text as soon as it opens, and goes back on request', async () => {
    searchObjects.mockClear()
    const back = vi.fn()
    const text = ref('coli species_taxid=562')
    const Host = defineComponent(() => () => h(view, { bucket: 'ncbi', nodeId: null, text: text.value, 'onUpdate:text': (value: string) => (text.value = value), onBack: back }))
    const { root } = await mountApp(Host)
    await flush()

    expect(searchObjects).toHaveBeenCalledWith('coli species_taxid=562', expect.objectContaining({ match: 'metadata' }))
    expect(content(root)).toContain('in the whole bucket')
    expect(content(root)).toContain('species_taxid = 562')
    // The chip leaves the box; the words stay in it.
    expect(text.value).toBe('coli')
    ;(element(root, (node) => node.tag === 'button' && content(node).includes('Back to folder')).props.onClick as () => void)()
    expect(back).toHaveBeenCalledOnce()
    expect(content(root)).not.toContain('Finds file names')
  })
})

describe('bucket search results by record folder', () => {
  const ECOLI = { organism_name: 'Escherichia coli str. K-12 substr. MG1655', infraspecific_name: 'strain=K-12 substr. MG1655', assembly_accession: 'GCF_000005845.2', assembly_level: 'Complete Genome' }
  const FOLDER = 'GCF_000005845.2_ASM584v2'
  const found = (key: string, metadata?: Record<string, string>) => ({ key, bucket: 'ncbi', issuer_node_id: 'n1', group_id: 'g1', ...(metadata ? { metadata } : {}) })
  async function open() {
    const opened: unknown[] = []
    const mounted = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null, onOpen: (hit: unknown) => opened.push(hit) } })
    ;(element(mounted.root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('coli species_taxid=562')
    await flush()
    ;(element(mounted.root, (node) => node.tag === 'form').props.onSubmit as (event: Event) => void)({ preventDefault: () => {} } as Event)
    await flush()
    return { ...mounted, opened }
  }

  it('shows one row per assembly, named by organism, with accession, level and files, and the folder as a link', async () => {
    searchObjects.mockImplementation(async (_q, options) => (options.match === 'metadata'
      ? { hits: [found(`${FOLDER}/`, ECOLI), found(`${FOLDER}/${FOLDER}_genomic.fna.gz`, ECOLI), found(`${FOLDER}/${FOLDER}_ani_report.txt`, ECOLI), found('plain.txt')], next_cursor: null, coverage: { complete: true } }
      : { hits: [], next_cursor: null, coverage: { complete: true } }))
    const { root, app, opened } = await open()
    const text = content(root)

    expect(text).toContain('Escherichia coli str. K-12 substr. MG1655')
    expect(text).toContain('1 genome and 1 file in the whole bucket')
    expect(text).toContain('GCF_000005845.2')
    expect(text).toContain('Complete Genome')
    expect(text).toContain('2 files')
    expect(text).not.toContain(`${FOLDER}_genomic.fna.gz`)
    expect(text).toContain('plain.txt')

    ;(element(root, (node) => node.tag === 'button' && node.props['aria-label'] === `Open ${FOLDER}/`).props.onClick as (event: unknown) => void)({ stopPropagation: () => {} })
    await flush()
    expect(opened).toEqual([found(`${FOLDER}/`, ECOLI)])

    const chevron = element(root, (node) => node.props['aria-expanded'] !== undefined)
    // A native button keeps its name, focus and Space key.
    expect(chevron.tag).toBe('button')
    expect(chevron.props['aria-label']).toMatch(/^Show the files of /)
    expect(chevron.props['aria-expanded']).toBe(false)
    await expand(root)
    expect(element(root, (node) => node.props['aria-expanded'] !== undefined).props['aria-expanded']).toBe(true)
    // The open group names its files without the folder name they repeat.
    await click(element(root, (node) => node.tag === 'tr' && content(node).trim() === '_ani_report.txt'))
    expect(opened.at(-1)).toEqual(found(`${FOLDER}/${FOLDER}_ani_report.txt`, ECOLI))
    app.unmount()
    searchObjects.mockReset().mockImplementation(async () => ({ hits: [hit] as unknown[], next_cursor: null, coverage: { complete: true } }))
  })

  it('names no file count for an assembly found only by its folder entry', async () => {
    const SAKAI = { organism_name: 'Escherichia coli O157:H7 str. Sakai', infraspecific_name: 'strain=Sakai substr. RIMD 0509952', assembly_accession: 'GCF_000008865.2', assembly_level: 'Complete Genome' }
    searchObjects.mockImplementation(async (_q, options) => (options.match === 'metadata'
      ? { hits: [found('GCF_000008865.2_ASM886v2/', SAKAI)], next_cursor: null, coverage: { complete: true } }
      : { hits: [], next_cursor: null, coverage: { complete: true } }))
    const { root, app } = await open()
    const text = content(root)

    expect(text).toContain('Escherichia coli O157:H7 str. Sakai substr. RIMD 0509952')
    expect(text).not.toContain('Sakai Sakai')
    expect(text).toContain('GCF_000008865.2')
    expect(text).toContain('Complete Genome')
    expect(nodes(root).some((node) => node.props['aria-label'] === 'Open GCF_000008865.2_ASM886v2/')).toBe(true)
    expect(text).not.toContain('0 files')
    app.unmount()
    searchObjects.mockReset().mockImplementation(async () => ({ hits: [hit] as unknown[], next_cursor: null, coverage: { complete: true } }))
  })

  it('appends a later page to its group, keeps it open and counts a lower bound while more may follow', async () => {
    searchObjects.mockImplementation(async (_q, options) => {
      if (options.match !== 'metadata') return { hits: [], next_cursor: null, coverage: { complete: true } }
      const cursor = (options as { cursor?: string }).cursor
      return cursor
        ? { hits: [found(`${FOLDER}/${FOLDER}_genomic.gff.gz`, ECOLI), found('GCF_9/GCF_9_genomic.fna.gz', { organism_name: 'Escherichia coli O157:H7' })], next_cursor: null, coverage: { complete: true } }
        : { hits: [found(`${FOLDER}/${FOLDER}_genomic.fna.gz`, ECOLI)], next_cursor: 'c2', coverage: { complete: true } }
    })
    const { root, app } = await open()
    expect(content(root)).toContain('1+ files')
    await expand(root)

    await click(element(root, (node) => node.tag === 'button' && content(node).includes('Show more')))
    await flush()
    const text = content(root)
    expect(text).toContain('2 files')
    expect(text.indexOf('Escherichia coli str. K-12')).toBeLessThan(text.indexOf('Escherichia coli O157:H7'))
    // The open group stayed open and shows the appended file.
    expect(shown(root, `${FOLDER}/${FOLDER}_genomic.gff.gz`)).toBe(true)
    app.unmount()
    searchObjects.mockReset().mockImplementation(async () => ({ hits: [hit] as unknown[], next_cursor: null, coverage: { complete: true } }))
  })
})
