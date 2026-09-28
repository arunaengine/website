import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, moduleDefault, mountApp } from '@/test/clientRender'
import type * as Api from '@/lib/api'
import * as Repository from '@/lib/repository'
import * as Utils from '@/lib/utils'

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const PublishedDialog = compileClientComponent(new URL('./PublishedDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/CopyButton.vue': moduleDefault(Empty),
  '@/components/ui/Dialog.vue': moduleDefault(Slot),
  '@/components/ui/DialogClose.vue': moduleDefault(Slot),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/ExternalLink.vue': moduleDefault(defineComponent({
    props: { label: String },
    setup: (props) => () => h('a', props.label),
  })),
  '@/lib/repository': Repository,
  '@/lib/utils': Utils,
})

function link(overrides: Partial<Api.RepositoryLink> = {}): Api.RepositoryLink {
  return {
    link_id: 'l1',
    document_id: 'd1',
    group_id: 'g1',
    connector_id: 'c1',
    kind: 'invenio',
    identifier_kind: 'doi',
    endpoint: 'https://zenodo.org/api/',
    owner_node_url: 'https://api.test',
    created_by: 'u1',
    direction: 'push',
    status: 'enabled',
    auto_publish: true,
    public_files: false,
    pending: false,
    remote: {
      published: true,
      identifier: '10.5281/zenodo.42',
      concept_identifier: '10.5281/zenodo.41',
      record_url: 'https://zenodo.org/records/42',
    },
    last_push: { event_id: 'e1', job_id: 'j1', pushed_at: new Date().toISOString() },
    created_at: '2026-09-22T00:00:00Z',
    updated_at: '2026-09-22T00:00:00Z',
    ...overrides,
  }
}

describe('PublishedDialog', () => {
  it('lists the published record of each link', async () => {
    const mounted = await mountApp(PublishedDialog, { props: { open: true, links: [link()] } })
    const text = content(mounted.root)

    expect(text).toContain('Published to Zenodo')
    expect(text).toContain('in 1 repository.')
    expect(text).toContain('Repositoryzenodo.org')
    expect(text).toContain('DOI10.5281/zenodo.42')
    expect(text).toContain('All versions10.5281/zenodo.41')
    expect(text).toContain('Open in the repository')
    expect(text).toContain('succeeded')
    expect(text).toContain('Published automatically on change')
    mounted.app.unmount()
  })

  it('names several repositories and a failed push', async () => {
    const other = link({ link_id: 'l2', endpoint: 'https://rdm.example.org/api/', auto_publish: false, status: 'failed', reason: 'token_rejected', last_push: null })
    const mounted = await mountApp(PublishedDialog, { props: { open: true, links: [link(), other] } })
    const text = content(mounted.root)

    expect(text).toContain('Published to repositories')
    expect(text).toContain('in 2 repositories.')
    expect(text).toContain('None yet')
    expect(text).toContain('The repository rejected the access token.')
    expect(text).toContain('Changes stay a draft until someone publishes them')
    mounted.app.unmount()
  })

  it('asks the page to open the Repositories section', async () => {
    const onManage = vi.fn()
    const mounted = await mountApp(PublishedDialog, { props: { open: true, links: [link()], onManage } })
    await click(button(mounted.root, 'Manage in Repositories'))

    expect(onManage).toHaveBeenCalledTimes(1)
    mounted.app.unmount()
  })
})
