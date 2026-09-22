import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  flush,
  input,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as Invenio from '@/lib/invenio'
import * as Utils from '@/lib/utils'

const SECRET = 'pat-secret-value'
const sessionEpoch = ref(0)
const createInvenioLink = vi.fn()
const submitInvenioExport = vi.fn()
const listPersistentIds = vi.fn()

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
const ToggleStub = defineComponent({
  props: { options: Array as () => { value: string; label: string }[] },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('div', props.options?.map((option) => h('button', { onClick: () => emit('update:modelValue', option.value) }, option.label))),
})

const Dialog = compileClientComponent(new URL('./RepositoryPublishDialog.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Slot },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Dialog.vue': moduleDefault(Slot),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/ui/OptionToggle.vue': moduleDefault(ToggleStub),
  '@/components/ui/Select.vue': moduleDefault(Empty),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/components/ui/Switch.vue': moduleDefault(Empty),
  '@/components/ui/Textarea.vue': moduleDefault(Empty),
  '@/components/metadata/TransferJobStatus.vue': moduleDefault(Empty),
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch }),
  },
  '@/composables/useInvenio': {
    useRepositoryConnectors: () => ({
      connectors: ref([{ connector_id: 'c1', kind: 'invenio', name: 'Zenodo', endpoint: 'https://zenodo.org/api/' }]),
      loading: ref(false),
      error: ref(null),
    }),
  },
  '@/composables/useJobs': {
    useJobDetail: () => ({ job: ref(null), loadState: ref('idle'), loadError: ref(null), lastPollError: ref(null), load: vi.fn() }),
  },
  '@/lib/api': { ...Api, createInvenioLink, submitInvenioExport },
  '@/lib/invenio': Invenio,
  '@/lib/pid': { listPersistentIds },
  '@/lib/utils': Utils,
})

async function mount() {
  const mounted = await mountApp(Dialog, { props: { open: true, documentId: 'd1', groupId: 'g1' } })
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

function tokenInput(root: Parameters<typeof input>[0]) {
  return input(root, 'aria-label', 'Personal access token')
}

beforeEach(() => {
  sessionEpoch.value = 0
  createInvenioLink.mockReset().mockResolvedValue({ link_id: 'l1' })
  submitInvenioExport.mockReset().mockResolvedValue({ job_id: 'j1', status_url: '/compute/jobs/j1' })
  listPersistentIds.mockReset().mockResolvedValue([
    { secondary_identifiers: [{ kind: 'invenio_parent', value: 'parent-1', endpoint: 'https://zenodo.org/api' }] },
  ])
})

describe('RepositoryPublishDialog', () => {
  it('creates a link that continues the source record and forgets the token', async () => {
    const mounted = await mount()
    await typeValue(tokenInput(mounted.root), SECRET)
    await click(button(mounted.root, 'Create link'))

    expect(createInvenioLink).toHaveBeenCalledWith(
      'd1',
      { group_id: 'g1', connector_id: 'c1', access_token: SECRET, parent_id: 'parent-1', auto_publish: false, public_files: false },
      expect.anything(),
    )
    expect(tokenInput(mounted.root).props.value).toBe('')
    mounted.app.unmount()
  })

  it('keeps the token out of the export idempotency key', async () => {
    const mounted = await mount()
    await click(button(mounted.root, 'Export once'))
    await typeValue(tokenInput(mounted.root), SECRET)
    await click(button(mounted.root, 'Start export'))

    const [documentId, repository, key] = submitInvenioExport.mock.calls[0]
    expect(documentId).toBe('d1')
    expect(repository).toMatchObject({ access_token: SECRET, publish: false, public_files: false })
    expect(key).not.toContain(SECRET)
    mounted.app.unmount()
  })

  it('clears a typed token when the session changes', async () => {
    const mounted = await mount()
    await typeValue(tokenInput(mounted.root), SECRET)
    sessionEpoch.value++
    await flush()

    expect(tokenInput(mounted.root).props.value).toBe('')
    mounted.app.unmount()
  })
})
