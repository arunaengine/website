import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  input,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'
import * as BucketName from '@/lib/bucketName'
import { languageById, runtimeById } from '@/lib/quickRuntimes'

const createBucket = vi.fn(async () => undefined)
const removeScript = vi.fn()

function scriptScene() {
  return {
    s3: { endpoint: ref('https://s3.example.test'), hasActiveKey: ref(true) },
    credentialDialogOpen: ref(false),
    executorMode: ref('runtime'),
    runtime: computed(() => runtimeById('python-uv')),
    language: computed(() => languageById('python')),
    languageId: ref('python'),
    languages: [languageById('python'), languageById('bash')],
    script: ref('open("in/reads.txt")'),
    scriptPath: ref('/work/script.py'),
    setScriptPath: vi.fn(),
    scriptKey: ref('.aruna/scripts/run/script.py'),
    setScriptKey: vi.fn(),
    scriptKeyProblem: computed(() => null),
    stagingBucket: ref(''),
    stagingBucketValid: computed(() => false),
    bucketOptions: computed(() => [] as Array<{ value: string; label: string }>),
    buckets: ref<string[]>([]),
    bucketsLoaded: ref(true),
    bucketsLoading: ref(false),
    createBucket,
    creatingBucket: ref(false),
    createBucketError: ref<string | null>(null),
    stagedFileUrl: computed(() => 's3:///.aruna/scripts/run/script.py'),
    editorTab: ref('script'),
    dependencies: ref<string[]>([]),
    scriptPaths: computed(() => [
      { path: '/work/in/reads.txt', kind: 'missing-input' as const, label: 'not an input', fix: 'input' as const },
    ]),
    capturePath: vi.fn(),
    openInputDialog: vi.fn(),
    removeScript,
    loadScriptOpen: ref(false),
    reuseSelectedScript: computed(() => false),
    scriptUrl: computed(() => ''),
    needsStagingLocation: computed(() => true),
    hasAi: () => false,
    clearAi: vi.fn(),
  }
}

let scene: ReturnType<typeof scriptScene>

const EmptyStub = defineComponent(() => () => null)
const PassThrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
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
const RunSectionStub = defineComponent({
  props: { title: String, complete: Boolean, checkLabel: String },
  setup: (props, { slots }) => () =>
    h('section', [
      h('h2', props.title),
      h('p', slots.state?.()),
      h('div', slots.controls?.()),
      h('span', props.checkLabel),
      slots.default?.(),
    ]),
})
const PathChipsStub = defineComponent({
  props: { label: String, checks: { type: Array, default: () => [] } },
  setup: (props) => () =>
    h('div', [props.label, ...(props.checks as Array<{ path: string; label: string }>).map((check) => h('span', `${check.path} ${check.label}`))]),
})

const ScriptCard = compileClientComponent(new URL('./ScriptCard.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(EmptyStub),
  '@/components/ui/Select.vue': moduleDefault(EmptyStub),
  '@/components/ui/OptionToggle.vue': moduleDefault(EmptyStub),
  '@/components/ui/DocsLink.vue': moduleDefault(EmptyStub),
  '@/components/ui/IconButton.vue': moduleDefault(ButtonStub),
  '@/components/compute/run/RunSection.vue': moduleDefault(RunSectionStub),
  '@/components/compute/run/PathChips.vue': moduleDefault(PathChipsStub),
  '@/components/compute/run/AiMark.vue': moduleDefault(EmptyStub),
  '@/components/compute/run/DependenciesTab.vue': moduleDefault(EmptyStub),
  '@/components/compute/ScriptEditor.vue': moduleDefault(PassThrough),
  '@/composables/useCustomRun': { injectCustomRun: () => scene },
  '@/lib/chunk-recovery': { asyncChunkError: () => {} },
  '@/lib/bucketName': BucketName,
})

function nameField(root: Parameters<typeof content>[0]) {
  return input(root, 'placeholder', 'new-bucket-name')
}

beforeEach(() => {
  createBucket.mockClear()
  removeScript.mockClear()
  scene = scriptScene()
})

describe('script card', () => {
  it('creates the first bucket from the empty state', async () => {
    const mounted = await mountApp(ScriptCard)

    expect(button(mounted.root, 'Create bucket').props.disabled).toBe(true)
    await typeValue(nameField(mounted.root), 'results')
    await click(button(mounted.root, 'Create bucket'))

    expect(createBucket).toHaveBeenCalledWith('results')
    mounted.app.unmount()
  })

  it('names the broken rule before the request', async () => {
    const mounted = await mountApp(ScriptCard)

    await typeValue(nameField(mounted.root), 'b1')

    expect(content(mounted.root)).toContain('Bucket names must contain at least 3 characters.')
    expect(button(mounted.root, 'Create bucket').props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('shows the refusal the creation reported', async () => {
    scene.createBucketError.value = 'AccessDenied: not allowed'
    const mounted = await mountApp(ScriptCard)

    expect(content(mounted.root)).toContain('AccessDenied: not allowed')
    mounted.app.unmount()
  })

  it('stays out of the way once a bucket exists', async () => {
    scene.buckets.value = ['data']
    scene.stagingBucket.value = 'data'
    const mounted = await mountApp(ScriptCard)

    expect(() => nameField(mounted.root)).toThrow()
    expect(content(mounted.root)).not.toContain('You have no buckets yet')
    mounted.app.unmount()
  })

  it('reports the paths the script names but nothing covers', async () => {
    const mounted = await mountApp(ScriptCard)

    expect(content(mounted.root)).toContain('Paths in the script:')
    expect(content(mounted.root)).toContain('/work/in/reads.txt not an input')
    expect(content(mounted.root)).toContain('1 path in the script not assigned.')
    mounted.app.unmount()
  })

  it('locks the language and the mount path under a runtime', async () => {
    const mounted = await mountApp(ScriptCard)

    expect(input(mounted.root, 'aria-label', 'Mounted at').props.readonly).toBe(true)
    expect(content(mounted.root)).toContain('Set by the runtime.')
    mounted.app.unmount()
  })

  it('drops the script when the run should not carry one', async () => {
    const mounted = await mountApp(ScriptCard)

    await click(element(mounted.root, (node) => node.props.label === 'Remove script'))
    expect(removeScript).toHaveBeenCalled()
    mounted.app.unmount()
  })
})
