import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import ListShell from './ListShell.vue'

type ShellProps = InstanceType<typeof ListShell>['$props']

function render(props: ShellProps, slots: Record<string, () => unknown> = {}): Promise<string> {
  return renderToString(createSSRApp({ render: () => h(ListShell, props, slots) }))
}

const rows = { default: () => h('ul', [h('li', 'one')]) }

describe('list shell', () => {
  it('shows skeleton rows instead of the list while it loads', async () => {
    const markup = await render({ state: 'loading', rows: 3 }, rows)

    expect(markup).not.toContain('one')
    expect(markup.match(/data-skeleton-row/g)).toHaveLength(3)
  })

  it('offers a retry on a load failure and hides the toolbar', async () => {
    const markup = await render({ state: 'error', error: 'The list refused.' }, {
      ...rows,
      tools: () => h('button', 'Refresh'),
    })

    expect(markup).toContain('The list refused.')
    expect(markup).toContain('Try again')
    expect(markup).not.toContain('Refresh')
  })

  it('renders the empty state without a stub icon', async () => {
    const markup = await render({ state: 'empty', emptyTitle: 'Nothing ran here yet' }, rows)

    expect(markup).toContain('Nothing ran here yet')
    expect(markup).not.toContain('one')
    expect(markup).not.toContain('mb-3 flex justify-center')
  })

  it('carries the toolbar, the rows and the pager when it is ready', async () => {
    const markup = await render({ state: 'ready' }, {
      ...rows,
      filters: () => h('span', 'chips'),
      tools: () => h('button', 'Refresh'),
      footer: () => h('button', 'Load more'),
    })

    expect(markup).toContain('chips')
    expect(markup).toContain('Refresh')
    expect(markup).toContain('one')
    expect(markup).toContain('Load more')
  })
})
