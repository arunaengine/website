import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as Invenio from '@/lib/invenio'
import * as Utils from '@/lib/utils'

const sessionEpoch = ref(0)
const listInvenioLinks = vi.fn()
const patchInvenioLink = vi.fn()
const rotateLinkToken = vi.fn()

function link(overrides: Partial<Api.InvenioLink> = {}): Api.InvenioLink {
  return {
    link_id: 'l1',
    document_id: 'd1',
    group_id: 'g1',
    connector_id: 'c1',
    endpoint: 'https://zenodo.org/api/',
    owner_node_url: 'https://node.test/api/v1',
    created_by: 'u1',
    status: 'enabled',
    auto_publish: false,
    public_files: false,
    pending: false,
    remote: { published: false },
    created_at: '2026-09-22T00:00:00Z',
    updated_at: '2026-09-22T00:00:00Z',
    ...overrides,
  }
}

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const EmptyStateStub = defineComponent({
  props: { title: String, description: String },
  setup: (props, { slots }) => () => h('div', [props.title, slots.default?.()]),
})

const Section = compileClientComponent(new URL('./RepositoryLinksSection.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Slot },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Badge.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/CopyButton.vue': moduleDefault(Empty),
  '@/components/ui/EmptyState.vue': moduleDefault(EmptyStateStub),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Empty),
  '@/components/ui/ExternalLink.vue': moduleDefault(defineComponent({
    props: { label: String },
    setup: (props) => () => h('a', props.label),
  })),
  '@/components/ui/Input.vue': moduleDefault(defineComponent({
    props: { modelValue: String },
    emits: ['update:modelValue'],
    setup: (props, { attrs, emit }) => () =>
      h('input', { ...attrs, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
  })),
  '@/components/ui/RefreshButton.vue': moduleDefault(Empty),
  '@/components/ui/Skeleton.vue': moduleDefault(Empty),
  '@/composables/useAruna': {
    isUnsupportedEndpoint: () => false,
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch }),
  },
  '@/lib/api': { ...Api, listInvenioLinks, patchInvenioLink, rotateLinkToken },
  '@/lib/invenio': Invenio,
  '@/lib/utils': Utils,
})

async function mount(documentId = 'd1') {
  const mounted = await mountApp(Section, { props: { documentId, canWrite: true } })
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

beforeEach(() => {
  sessionEpoch.value = 0
  listInvenioLinks.mockReset()
  patchInvenioLink.mockReset()
  rotateLinkToken.mockReset()
})

describe('RepositoryLinksSection', () => {
  it('shows state, waiting push, DOI and a readable failure', async () => {
    listInvenioLinks.mockResolvedValue([
      link({ pending: true, remote: { published: true, doi: '10.5281/zenodo.9' } }),
      link({ link_id: 'l2', status: 'failed', reason: 'token_rejected' }),
    ])
    const mounted = await mount()
    const text = content(mounted.root)

    expect(text).toContain('Enabled')
    expect(text).toContain('Push waiting')
    expect(text).toContain('Published')
    expect(text).toContain('10.5281/zenodo.9')
    expect(text).toContain('Failed')
    expect(text).toContain('Change the token to continue')
    mounted.app.unmount()
  })

  it('does not read a pending list as empty', async () => {
    listInvenioLinks.mockReturnValue(new Promise(() => undefined))
    const mounted = await mount()

    expect(content(mounted.root)).not.toContain('Not linked to a repository.')
    mounted.app.unmount()
  })

  it('drops a list that answers after the session changed', async () => {
    let answer!: (value: Api.InvenioLink[]) => void
    listInvenioLinks
      .mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
      .mockResolvedValueOnce([])
    const mounted = await mount()
    sessionEpoch.value++
    await flush()
    answer([link()])
    await flush()

    expect(content(mounted.root)).toContain('Not linked to a repository.')
    expect(content(mounted.root)).not.toContain('zenodo.org')
    mounted.app.unmount()
  })

  it('pauses an enabled link', async () => {
    listInvenioLinks.mockResolvedValue([link()])
    patchInvenioLink.mockResolvedValue(link({ status: 'paused' }))
    const mounted = await mount()
    await click(button(mounted.root, 'Pause'))

    expect(patchInvenioLink).toHaveBeenCalledWith('d1', 'l1', { paused: true }, expect.anything())
    mounted.app.unmount()
  })

  it('clears the token draft when the session changes', async () => {
    listInvenioLinks.mockResolvedValue([link()])
    const mounted = await mount()
    await click(button(mounted.root, 'Change token'))
    expect(content(mounted.root)).toContain('Save token')

    sessionEpoch.value++
    await flush()
    await flush()
    expect(content(mounted.root)).not.toContain('Save token')
    expect(rotateLinkToken).not.toHaveBeenCalled()
    mounted.app.unmount()
  })
})
