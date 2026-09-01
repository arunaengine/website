import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'
import { BUCKET_NAME_REQUIREMENT, bucketNameProblem } from '@/lib/bucketName'

const createBucket = vi.fn()

const Empty = defineComponent(() => () => null)
const icons = new Proxy({}, { get: () => Empty })
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})

const BucketSidebar = compileClientComponent(new URL('./BucketSidebar.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/lib/bucketName': { BUCKET_NAME_REQUIREMENT },
  '@/composables/useS3': { useS3: () => ({ canDeletePrefix: () => true, clearSessions: vi.fn() }) },
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/components/data/BucketRow.vue': moduleDefault(Empty),
  '@/components/data/BucketSearchBox.vue': moduleDefault(Empty),
})

/** The slice of the data manager the sidebar reads, with the real name rule. */
function manager() {
  const newBucketName = ref('')
  const newBucketProblem = computed(() => {
    const name = newBucketName.value.trim()
    return name ? bucketNameProblem(name) : null
  })
  return {
    bucket: ref(''),
    remoteNodeId: ref(null),
    syncByBucket: ref(new Map()),
    syncKeyFor: () => '',
    openSearchHit: vi.fn(),
    openBucket: vi.fn(),
    openBucketOn: vi.fn(),
    shortcuts: { togglePin: vi.fn() },
    sidebarBuckets: ref([]),
    recentBuckets: ref([]),
    workspaceBuckets: ref([]),
    workspacesOpen: ref(false),
    bucketsLoaded: ref(true),
    bucketsLoading: ref(false),
    bucketsRefreshing: ref(false),
    bucketsError: ref(null),
    bucketsAuthError: ref(false),
    newBucketName,
    newBucketProblem,
    newBucketRefusal: computed(() => null),
    createBucketBlocker: computed(() => newBucketProblem.value),
    creatingBucket: ref(false),
    createBucket,
    createBucketError: ref(null),
  }
}

function field(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.props['aria-label'] === 'New bucket name')
}

function createButton(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.props['aria-label'] === 'Create bucket')
}

describe('Bucket sidebar naming', () => {
  it('states the rule before anything is typed', async () => {
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager() } })
    expect(content(root)).toContain(BUCKET_NAME_REQUIREMENT)
  })

  it('names the broken rule and disables creation for b1', async () => {
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager() } })

    await typeValue(field(root), 'b1')

    expect(content(root)).toContain('Bucket names must contain at least 3 characters.')
    expect(field(root).props.invalid).toBe('error')
    expect(createButton(root).props.disabled).toBe(true)
  })

  it('accepts a name the node accepts', async () => {
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager() } })

    await typeValue(field(root), 'reef-survey-2026')

    expect(content(root)).toContain(BUCKET_NAME_REQUIREMENT)
    expect(field(root).props.invalid).toBeUndefined()
    expect(createButton(root).props.disabled).toBe(false)
  })
})
