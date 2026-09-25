import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as Repository from '@/lib/repository'
import * as Utils from '@/lib/utils'

const sessionEpoch = ref(0)
const listRepositoryLinks = vi.fn()
const patchRepositoryLink = vi.fn()
const rotateLinkToken = vi.fn()
const pushRepositoryLink = vi.fn()
const acceptRemoteLink = vi.fn()
const pullRepositoryLink = vi.fn()
const getJob = vi.fn()
const userId = ref('u1')
// Groups the caller administers.
const adminGroups = ref<string[]>([])
// The captured poll: run is one tick, delay the next wait, skip whether the tick would idle.
let poller: { run: () => Promise<void>; delay: () => number; skip: () => boolean } | null = null

function link(overrides: Partial<Api.RepositoryLink> = {}): Api.RepositoryLink {
  return {
    link_id: 'l1',
    document_id: 'd1',
    group_id: 'g1',
    connector_id: 'c1',
    kind: 'invenio',
    endpoint: 'https://zenodo.org/api/',
    owner_node_url: 'https://api.test',
    created_by: 'u1',
    direction: 'push',
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
  '@/components/ui/Switch.vue': moduleDefault(Empty),
  '@/composables/useRepository': {
    useGroupRights: () => ({ userId, adminOf: (group: string) => adminGroups.value.includes(group) }),
  },
  '@/lib/jobs': { getJob, isTerminalJobState: (state: string) => ['succeeded', 'failed', 'cancelled'].includes(state) },
  '@/lib/poll': {
    POLL_ACTIVE_MS: 3000,
    POLL_SLOW_MS: 15000,
    follow: (run: () => Promise<void>, delay: () => number, skip: () => boolean) => {
      poller = { run, delay, skip }
      return () => (poller = null)
    },
  },
  '@/composables/useAruna': {
    isUnsupportedEndpoint: () => false,
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch }),
  },
  '@/lib/api': { ...Api, listRepositoryLinks, patchRepositoryLink, rotateLinkToken, pushRepositoryLink, acceptRemoteLink, pullRepositoryLink },
  '@/lib/repository': Repository,
  '@/lib/utils': Utils,
})

const onSettled = vi.fn()

async function mount(documentId = 'd1') {
  const mounted = await mountApp(Section, { props: { documentId, groupId: 'g1', canWrite: true, onSettled } })
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

beforeEach(() => {
  sessionEpoch.value = 0
  userId.value = 'u1'
  adminGroups.value = []
  for (const mock of [onSettled, listRepositoryLinks, patchRepositoryLink, rotateLinkToken, pushRepositoryLink, acceptRemoteLink, pullRepositoryLink, getJob]) {
    mock.mockReset()
  }
})

function hasButton(root: Parameters<typeof button>[0], label: string): boolean {
  try {
    button(root, label)
    return true
  } catch {
    return false
  }
}

describe('RepositoryLinksSection', () => {
  it('shows state, waiting push, DOI and a readable failure', async () => {
    listRepositoryLinks.mockResolvedValue([
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
    listRepositoryLinks.mockReturnValue(new Promise(() => undefined))
    const mounted = await mount()

    expect(content(mounted.root)).not.toContain('Not linked to a repository.')
    mounted.app.unmount()
  })

  it('drops a list that answers after the session changed', async () => {
    let answer!: (value: Api.RepositoryLink[]) => void
    listRepositoryLinks
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
    listRepositoryLinks.mockResolvedValue([link()])
    patchRepositoryLink.mockResolvedValue(link({ status: 'paused' }))
    const mounted = await mount()
    await click(button(mounted.root, 'Pause'))

    expect(patchRepositoryLink).toHaveBeenCalledWith('d1', 'l1', { paused: true }, expect.anything())
    mounted.app.unmount()
  })

  it('resumes a failed pull link', async () => {
    listRepositoryLinks.mockResolvedValue([link({ direction: 'pull', status: 'failed', reason: 'source_unavailable' })])
    patchRepositoryLink.mockResolvedValue(link({ direction: 'pull' }))
    const mounted = await mount()

    expect(content(mounted.root)).toContain('withdrawn or deleted')
    expect(hasButton(mounted.root, 'Pause')).toBe(false)
    await click(button(mounted.root, 'Resume'))
    expect(patchRepositoryLink).toHaveBeenCalledWith('d1', 'l1', { paused: false }, expect.anything())
    mounted.app.unmount()
  })

  it('takes admin rights from the group of the link, not of the dataset', async () => {
    userId.value = 'u2'
    adminGroups.value = ['g1']
    listRepositoryLinks.mockResolvedValue([link({ group_id: 'g2' })])
    const mounted = await mount()
    expect(hasButton(mounted.root, 'Push now')).toBe(false)
    mounted.app.unmount()

    adminGroups.value = ['g2']
    const other = await mount()
    expect(hasButton(other.root, 'Push now')).toBe(true)
    expect(hasButton(other.root, 'Remove link')).toBe(true)
    other.app.unmount()
  })

  it('clears the token draft when the session changes', async () => {
    listRepositoryLinks.mockResolvedValue([link()])
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

  it('polls while a push waits and stops once it settled', async () => {
    listRepositoryLinks
      .mockResolvedValueOnce([link({ pending: true })])
      .mockResolvedValueOnce([link({ pending: false, remote: { published: false, doi: '10.5281/zenodo.5', doi_reserved: true } })])
    const mounted = await mount()
    expect(poller?.skip()).toBe(false)
    expect(poller?.delay()).toBe(3000)

    await poller!.run()
    await flush()
    expect(poller?.skip()).toBe(true)
    expect(onSettled).toHaveBeenCalled()
    expect(content(mounted.root)).toContain('Reserved, becomes active when published.')
    mounted.app.unmount()
  })

  it('follows a started job until it is finished', async () => {
    listRepositoryLinks.mockResolvedValue([link({ remote: { published: false, draft_id: 'd' } })])
    pushRepositoryLink.mockResolvedValue({ job_id: 'j1', status_url: '/jobs/j1' })
    getJob.mockResolvedValueOnce({ state: 'running' }).mockResolvedValueOnce({ state: 'succeeded' })
    const mounted = await mount()
    expect(poller?.skip()).toBe(true)

    await click(button(mounted.root, 'Push now'))
    expect(poller?.skip()).toBe(false)
    expect(button(mounted.root, 'Publish').props.disabled).toBe(true)
    await poller!.run()
    expect(poller?.skip()).toBe(false)
    await poller!.run()
    await flush()
    expect(poller?.skip()).toBe(true)
    expect(button(mounted.root, 'Publish').props.disabled).toBe(false)
    mounted.app.unmount()
  })

  it('keeps polling while a community review is open and hides publish', async () => {
    listRepositoryLinks.mockResolvedValue([link({ remote: { published: false, draft_id: 'd', review: 'pending' } })])
    const mounted = await mount()

    expect(poller?.skip()).toBe(false)
    expect(poller?.delay()).toBe(15000)
    expect(content(mounted.root)).toContain('Waiting for community review')
    expect(hasButton(mounted.root, 'Publish')).toBe(false)
    mounted.app.unmount()
  })

  it('gives a group admin management but not the owner actions', async () => {
    userId.value = 'u2'
    adminGroups.value = ['g1']
    listRepositoryLinks.mockResolvedValue([link({ remote: { published: false, draft_id: 'd' } })])
    const mounted = await mount()

    expect(hasButton(mounted.root, 'Push now')).toBe(true)
    expect(hasButton(mounted.root, 'Pause')).toBe(true)
    expect(hasButton(mounted.root, 'Remove link')).toBe(true)
    expect(hasButton(mounted.root, 'Publish')).toBe(false)
    expect(hasButton(mounted.root, 'Change token')).toBe(false)
    mounted.app.unmount()
  })

  it('shows no actions to a writer who neither created the link nor administers the group', async () => {
    userId.value = 'u2'
    listRepositoryLinks.mockResolvedValue([link()])
    const mounted = await mount()

    expect(hasButton(mounted.root, 'Push now')).toBe(false)
    expect(hasButton(mounted.root, 'Remove link')).toBe(false)
    mounted.app.unmount()
  })

  it('sends actions of a link owned by another node nowhere', async () => {
    listRepositoryLinks.mockResolvedValue([link({ owner_node_url: 'https://other.test/api/v1' })])
    const mounted = await mount()

    expect(content(mounted.root)).toContain('managed by the node at')
    expect(content(mounted.root)).toContain('https://other.test/api/v1')
    expect(hasButton(mounted.root, 'Push now')).toBe(false)
    mounted.app.unmount()
  })

  it('offers the remote state to a group admin after a remote change', async () => {
    userId.value = 'u2'
    adminGroups.value = ['g1']
    listRepositoryLinks.mockResolvedValue([link({ status: 'failed', reason: 'remote_changed', warning: 'Checksums differ.' })])
    acceptRemoteLink.mockResolvedValue(link())
    const mounted = await mount()

    expect(content(mounted.root)).toContain('Checksums differ.')
    await click(button(mounted.root, 'Accept remote state'))
    expect(acceptRemoteLink).toHaveBeenCalledWith('d1', 'l1', expect.anything())
    mounted.app.unmount()
  })

  it('updates a pull link on request', async () => {
    listRepositoryLinks.mockResolvedValue([
      link({ direction: 'pull', reason: 'update_available', auto_update: false, last_checked_at: null }),
    ])
    pullRepositoryLink.mockResolvedValue({ job_id: 'j2', status_url: '/jobs/j2' })
    const mounted = await mount()
    const text = content(mounted.root)

    expect(text).toContain('A newer version is available')
    expect(text).toContain('Last checked')
    expect(text).toContain('Not yet')
    for (const label of ['Push now', 'Publish', 'Change token', 'Accept remote state']) {
      expect(hasButton(mounted.root, label)).toBe(false)
    }
    await click(button(mounted.root, 'Update now'))
    expect(pullRepositoryLink).toHaveBeenCalledWith('d1', 'l1', expect.anything())
    expect(poller?.skip()).toBe(false)
    mounted.app.unmount()
  })

  it('explains a failed pull without asking for a personal token', async () => {
    listRepositoryLinks.mockResolvedValue([link({ direction: 'pull', status: 'failed', reason: 'token_rejected' })])
    const mounted = await mount()
    const text = content(mounted.root)

    expect(text).toContain("the group's repository token")
    expect(text).not.toContain('Change the token to continue')
    mounted.app.unmount()
  })

  it('lets a group admin update a pull link but not switch automatic updates', async () => {
    userId.value = 'u2'
    adminGroups.value = ['g1']
    listRepositoryLinks.mockResolvedValue([link({ direction: 'pull', reason: 'local_changed', auto_update: true })])
    pullRepositoryLink.mockResolvedValue({ job_id: 'j3', status_url: '/jobs/j3' })
    const mounted = await mount()

    expect(content(mounted.root)).toContain('not imported automatically')
    expect(content(mounted.root)).not.toContain('Update automatically')
    await click(button(mounted.root, 'Update now'))
    expect(pullRepositoryLink).toHaveBeenCalledWith('d1', 'l1', expect.anything())
    mounted.app.unmount()
  })
})
