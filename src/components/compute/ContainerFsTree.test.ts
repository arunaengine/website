import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  click,
  compileClientComponent,
  content,
  element,
  flush,
  input,
  moduleDefault,
  mountApp,
  nodes,
  typeValue,
  type HostNode,
} from '@/test/clientRender'
import * as Tes from '@/lib/tes'

const EmptyStub = defineComponent(() => () => null)
const PassThrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
// A menu item is a button carrying its own select handler, so a test can press it.
const MenuItemStub = defineComponent({
  emits: ['select'],
  setup: (_, { emit, slots }) => () => h('button', { onClick: () => emit('select') }, slots.default?.()),
})

const ContainerFsTree = compileClientComponent(new URL('./ContainerFsTree.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Badge.vue': moduleDefault(PassThrough),
  '@/components/ui/Notice.vue': moduleDefault(PassThrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Select.vue': moduleDefault(EmptyStub),
  '@/components/ui/DropdownMenu.vue': moduleDefault(PassThrough),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(PassThrough),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(MenuItemStub),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(PassThrough),
  '@/components/compute/run/AiMark.vue': moduleDefault(EmptyStub),
  '@/lib/tes': Tes,
})

/** Presses Enter on a field, the way an inline editor is committed. */
async function pressEnter(field: HostNode) {
  const handler = field.props.onKeydown
  const listeners = Array.isArray(handler) ? handler : handler ? [handler] : []
  for (const listener of listeners) await listener({ key: 'Enter', preventDefault: () => {}, target: field })
  await flush()
}

function menuItem(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.tag === 'button' && content(node).trim() === label)
}

async function mount(overrides: Record<string, unknown> = {}) {
  const events: Array<[string, unknown[]]> = []
  const record = (name: string) => (...args: unknown[]) => events.push([name, args])
  const Harness = defineComponent(() => {
    const inputs = ref([
      { kind: 'file' as const, url: 's3://data/reads.txt', path: '/work/in/reads.txt', name: 'reads.txt' },
    ])
    return () =>
      h(ContainerFsTree, {
        inputs: inputs.value,
        outputs: [
          {
            containerPath: '/work/out/result.txt',
            destination: 's3://results/runs/result.txt',
            bucket: 'results',
            key: 'runs/result.txt',
          },
        ],
        script: { path: '/work/script.py', label: 's3://results/script.py' },
        workspace: '/work',
        ...overrides,
        onUseAsScript: record('use-as-script'),
        onUnmarkScript: record('unmark-script'),
        onUpdateScriptPath: record('update-script-path'),
        onUpdateOutputDestination: record('update-output-destination'),
        onAddOutputFile: record('add-output-file'),
      })
  })
  return { ...(await mountApp(Harness)), events }
}

describe('container filesystem tree', () => {
  it('turns a staged file into the run script', async () => {
    const mounted = await mount()

    await click(menuItem(mounted.root, 'Use as script'))

    expect(mounted.events).toEqual([['use-as-script', [0]]])
    mounted.app.unmount()
  })

  it('gives the script row back its plain input state', async () => {
    const mounted = await mount()

    await click(menuItem(mounted.root, 'Unmark as script'))

    expect(mounted.events).toEqual([['unmark-script', []]])
    mounted.app.unmount()
  })

  it('edits the mount path of the script in place', async () => {
    const mounted = await mount()

    await click(menuItem(mounted.root, 'Change mount path'))
    const field = input(mounted.root, 'aria-label', 'Path')
    await typeValue(field, '/work/bin/run.py')
    await pressEnter(field)

    expect(mounted.events).toEqual([['update-script-path', ['/work/bin/run.py']]])
    mounted.app.unmount()
  })

  it('names a new output file in an inline row', async () => {
    const mounted = await mount()

    await click(menuItem(mounted.root, 'New output file'))
    const field = input(mounted.root, 'aria-label', 'New output file name')
    await typeValue(field, 'report.html')
    await pressEnter(field)

    expect(mounted.events[0][0]).toBe('add-output-file')
    expect(mounted.events[0][1][1]).toBe('report.html')
    mounted.app.unmount()
  })

  it('edits the destination of a capture inline', async () => {
    const mounted = await mount()

    await click(menuItem(mounted.root, 'Change destination'))
    await typeValue(input(mounted.root, 'aria-label', 'Destination key'), 'runs/other.txt')
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Done'))

    expect(mounted.events).toEqual([['update-output-destination', [0, 'results', 'runs/other.txt']]])
    mounted.app.unmount()
  })

  it('shows the destination of a capture in its row', async () => {
    const mounted = await mount()

    expect(content(mounted.root)).toContain('s3://results/runs/result.txt')
    expect(nodes(mounted.root).some((node) => node.props['aria-label'] === 'Actions for script.py')).toBe(true)
    mounted.app.unmount()
  })
})
