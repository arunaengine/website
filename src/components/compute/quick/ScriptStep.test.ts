import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  input,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'

const createBucket = vi.fn(async () => undefined)

function quickRun() {
  return {
    s3: { endpoint: ref('https://s3.example.test'), hasActiveKey: ref(true) },
    credentialDialogOpen: ref(false),
    groupId: ref('group-1'),
    groupOptions: ref([{ value: 'group-1', label: 'Group' }]),
    reuseSelectedScript: ref(false),
    scriptUrl: ref(''),
    needsStagingLocation: ref(true),
    bucketOptions: ref<Array<{ value: string; label: string }>>([]),
    buckets: ref<string[]>([]),
    bucketsLoaded: ref(true),
    bucketsLoading: ref(false),
    stagingBucket: ref(''),
    stagingBucketValid: ref(false),
    scriptKey: ref('quickruns/main.py'),
    scriptKeyValid: ref(true),
    defaultScriptKey: ref('quickruns/main.py'),
    setScriptKey: vi.fn(),
    stagedFileUrl: ref('s3://results/quickruns/main.py'),
    editorTab: ref('work'),
    runtimeId: ref('python-uv'),
    dependencies: ref<string[]>([]),
    script: ref('print(1)'),
    runtime: ref({ file: 'main.py', lang: 'python', template: '' }),
    commandPreview: ref('uv run main.py'),
    loadScriptOpen: ref(false),
    createBucket,
    creatingBucket: ref(false),
    createBucketError: ref<string | null>(null),
  }
}

let scene: ReturnType<typeof quickRun>

const EmptyStub = defineComponent(() => () => null)
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
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

const ScriptStep = compileClientComponent(new URL('./ScriptStep.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(EmptyStub),
  '@/components/ui/Select.vue': moduleDefault(EmptyStub),
  '@/components/ui/Tabs.vue': moduleDefault(EmptyStub),
  '@/components/ui/TabsContent.vue': moduleDefault(EmptyStub),
  '@/components/ui/TabsList.vue': moduleDefault(EmptyStub),
  '@/components/ui/TabsTrigger.vue': moduleDefault(EmptyStub),
  '@/components/groups/GroupSelect.vue': moduleDefault(EmptyStub),
  '@/components/compute/quick/ContainerDataPanel.vue': moduleDefault(EmptyStub),
  '@/components/compute/quick/DependenciesTab.vue': moduleDefault(EmptyStub),
  '@/components/compute/ScriptEditor.vue': moduleDefault(EmptyStub),
  '@/composables/useQuickRun': { injectQuickRun: () => scene },
  '@/lib/chunk-recovery': { asyncChunkError: () => {} },
})

function nameField(root: Parameters<typeof content>[0]) {
  return input(root, 'placeholder', 'new-bucket-name')
}

beforeEach(() => {
  createBucket.mockClear()
  scene = quickRun()
})

describe('ScriptStep bucket creation', () => {
  it('creates the first bucket from the empty state', async () => {
    const mounted = await mountApp(ScriptStep)

    expect(button(mounted.root, 'Create bucket').props.disabled).toBe(true)
    await typeValue(nameField(mounted.root), 'results')
    await click(button(mounted.root, 'Create bucket'))

    expect(createBucket).toHaveBeenCalledWith('results')
    mounted.app.unmount()
  })

  it('shows the refusal the creation reported', async () => {
    scene.createBucketError.value = 'AccessDenied: not allowed'
    const mounted = await mountApp(ScriptStep)

    expect(content(mounted.root)).toContain('AccessDenied: not allowed')
    mounted.app.unmount()
  })

  it('stays out of the way once a bucket exists', async () => {
    scene.buckets.value = ['data']
    scene.bucketOptions.value = [{ value: 'data', label: 'data' }]
    scene.stagingBucket.value = 'data'
    scene.stagingBucketValid.value = true
    const mounted = await mountApp(ScriptStep)

    expect(() => nameField(mounted.root)).toThrow()
    expect(content(mounted.root)).not.toContain('You have no buckets yet')
    mounted.app.unmount()
  })
})
