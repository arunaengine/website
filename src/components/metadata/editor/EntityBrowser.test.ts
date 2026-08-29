import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  nodes,
  typeValue,
  type HostNode,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
const BadgeStub = defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    })
  },
})

const EntityBrowser = compileClientComponent(new URL('./EntityBrowser.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  './icons': { entityIcon: () => EmptyStub },
  './AddEntityDialog.vue': moduleDefault(EmptyStub),
  './AddFilesDialog.vue': moduleDefault(EmptyStub),
  '@/lib/crate/editor': Editor,
})

function seeded() {
  const named = Editor.updateValue(Editor.newDraft(), './', 'name', 0, 'Example dataset')
  const person = Editor.addEntity(named, { type: 'Person', name: 'Ada Lovelace' })
  return Editor.addFilePart(person.draft, { id: 's3://bucket/reads.csv', name: 'reads.csv' })
}

function mount(props: Record<string, unknown> = {}, selections: string[] = []) {
  return mountApp(EntityBrowser, {
    props: {
      draft: seeded(),
      vocab: null,
      selected: './',
      issues: [],
      onSelect: (id: string) => selections.push(id),
      ...props,
    },
  })
}

function row(root: HostNode, label: string): HostNode {
  const match = nodes(root).find((node) => node.tag === 'button' && content(node).includes(label))
  if (!match) throw new Error(`No row for ${label}`)
  return match
}

describe('EntityBrowser', () => {
  it('groups the dataset, its files and the rest', async () => {
    const mounted = await mount()
    const text = content(mounted.root)

    expect(text.indexOf('This dataset')).toBeLessThan(text.indexOf('Files'))
    expect(text.indexOf('Files')).toBeLessThan(text.indexOf('Entities'))
    expect(text.indexOf('reads.csv')).toBeLessThan(text.indexOf('Ada Lovelace'))
    mounted.app.unmount()
  })

  it('filters the rows by name, id or type', async () => {
    const mounted = await mount()
    const search = element(mounted.root, (node) => node.props['aria-label'] === 'Search entities')

    await typeValue(search, 'ada')
    expect(content(mounted.root)).toContain('Ada Lovelace')
    expect(content(mounted.root)).not.toContain('reads.csv')

    await typeValue(search, 'nothing here')
    expect(content(mounted.root)).toContain('Nothing here matches that search.')
    mounted.app.unmount()
  })

  it('counts the problems of each entity', async () => {
    const draft = seeded()
    const issues = Editor.liveIssues(
      Editor.addValue(draft, '#ada-lovelace', 'url', { kind: 'url', value: '' }),
    ).filter((issue) => issue.entityId === '#ada-lovelace')
    const mounted = await mount({ issues })

    expect(content(row(mounted.root, 'Ada Lovelace'))).toContain(String(issues.length))
    expect(content(row(mounted.root, 'reads.csv'))).not.toContain('1')
    mounted.app.unmount()
  })

  it('separates adding data from adding context', async () => {
    const mounted = await mount()

    expect(button(mounted.root, 'Add files')).toBeDefined()
    expect(button(mounted.root, 'Add entity')).toBeDefined()
    // The graph is switched from the page's own toggle, never from here.
    expect(() => button(mounted.root, 'Graph')).toThrow()
    mounted.app.unmount()
  })

  it('marks the selected row and reports a new pick', async () => {
    const selections: string[] = []
    const mounted = await mount({ selected: '#ada-lovelace' }, selections)

    expect(row(mounted.root, 'Ada Lovelace').props['aria-current']).toBe('true')
    await click(row(mounted.root, 'reads.csv'))

    expect(selections).toEqual(['s3://bucket/reads.csv'])
    mounted.app.unmount()
  })
})
