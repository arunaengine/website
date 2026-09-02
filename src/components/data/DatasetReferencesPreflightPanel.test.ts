import { describe, expect, it } from 'vitest'
import { button, click, content, element, mountApp, nodes, type HostNode } from '@/test/clientRender'
import { referencedContent, referencesPanel } from '@/test/deletionImpact'
import type { BacklinkPreflightResponse } from '@/lib/backlinks'

const panel = referencesPanel()

function coverage(states: string[], failed = 0): BacklinkPreflightResponse {
  const response = referencedContent(0)
  response.nodes_queried = states.length + failed
  response.nodes_failed = failed
  response.complete = failed === 0
  response.coverage.node_freshness = states.map((state, index) => ({
    node_id: `node-${index + 1}`,
    index_state: state,
    oldest_status_updated_at_ms: null,
  }))
  return response
}

async function render(preflight: BacklinkPreflightResponse | null): Promise<HostNode> {
  const { root } = await mountApp(panel, { props: { preflight, busy: false, error: null } })
  return root
}

function icons(node: HostNode): string[] {
  return nodes(node)
    .filter((child) => typeof child.props['data-icon'] === 'string')
    .map((child) => String(child.props['data-icon']))
}

function summary(root: HostNode): HostNode {
  return element(root, (node) => node.tag === 'p' && content(node).startsWith('Index'))
}

function rows(root: HostNode): string[] {
  return nodes(root)
    .filter((node) => node.tag === 'li')
    .map((node) => content(node).trim())
}

describe('dataset reference coverage', () => {
  it('sums a fully current index into one line', async () => {
    const root = await render(coverage(['current', 'current', 'current']))

    expect(content(root)).toContain('Index current on 3 of 3 nodes')
    expect(icons(summary(root))).toEqual(['Check'])
    expect(content(root)).not.toContain('timestamp unavailable')
  })

  it('keeps the node rows behind the disclosure', async () => {
    const root = await render(coverage(['current', 'current', 'current']))

    const toggle = button(root, 'Show the nodes')
    expect(toggle.props['aria-expanded']).toBe(false)
    expect(rows(root)).toHaveLength(0)
    expect(content(root)).not.toContain('Scope:')

    await click(toggle)

    expect(button(root, 'Hide the nodes').props['aria-expanded']).toBe(true)
    expect(rows(root)).toEqual(['node-1', 'node-2', 'node-3'])
    expect(content(root)).toContain('Scope: bucket prefix')
    expect(content(root)).toContain('Forms: content w3id')
  })

  it('warns about a node whose index is behind', async () => {
    const root = await render(coverage(['current', 'current', 'pending']))

    expect(content(root)).toContain('Index current on 2 of 3 nodes')
    expect(icons(summary(root))).toEqual(['TriangleAlert'])

    await click(button(root, 'Show the nodes'))
    const behind = element(root, (node) => node.tag === 'li' && content(node).includes('node-3'))

    expect(icons(behind)).toEqual(['TriangleAlert'])
    expect(content(behind)).toContain('pending')
  })

  it('says how many nodes did not answer', async () => {
    const root = await render(coverage(['current', 'current'], 1))

    expect(content(root)).toContain('1 node did not answer')
    expect(content(root)).toContain('coverage is partial')
    expect(icons(summary(root))).toEqual(['TriangleAlert'])
  })

  it('dates a node only when the node reported a time', async () => {
    const dated = coverage(['current'])
    dated.coverage.node_freshness[0].oldest_status_updated_at_ms = Date.now() - 3_600_000
    const root = await render(dated)
    await click(button(root, 'Show the nodes'))

    expect(content(root)).toContain('as of 1h ago')

    const undated = await render(coverage(['current']))
    await click(button(undated, 'Show the nodes'))

    expect(content(undated)).not.toContain('as of')
    expect(content(undated)).not.toContain('timestamp unavailable')
  })

  it('sends the caveats to the docs section that carries them', async () => {
    const root = await render(coverage(['current']))

    const link = element(root, (node) => node.props['data-topic'] === 'data-and-deletion')

    expect(link.props['data-section']).toBe('What the reference check covers')
  })

  it('states the freshness is unknown when no node reported one', async () => {
    const root = await render(coverage([]))

    expect(content(root)).toContain('Index freshness was not reported')
    expect(icons(summary(root))).toEqual(['TriangleAlert'])

    await click(button(root, 'Show the nodes'))

    expect(content(root)).toContain('No node reported its index state.')
  })
})
