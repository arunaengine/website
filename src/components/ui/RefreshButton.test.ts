import { describe, expect, it } from 'vitest'
import { content, element, mountApp, refreshButton, type HostNode } from '@/test/clientRender'

async function render(props: Record<string, unknown>): Promise<HostNode> {
  const { root } = await mountApp(refreshButton(), { props })
  return element(root, (node) => node.tag === 'button')
}

describe('refresh button', () => {
  it('spins and locks while busy', async () => {
    const button = await render({ busy: true })
    expect(button.props.disabled).toBe(true)
    expect(button.props['aria-busy']).toBe(true)
    expect(element(button, (node) => node.tag === 'i').props.class).toContain('animate-spin')
  })

  it('rests with the icon still', async () => {
    const button = await render({ busy: false })
    expect(button.props.disabled).toBe(false)
    expect(button.props['aria-busy']).toBe(false)
    expect(element(button, (node) => node.tag === 'i').props.class).not.toContain('animate-spin')
    expect(content(button).trim()).toBe('Refresh')
  })

  it('names an icon-only button', async () => {
    const button = await render({ busy: false, srLabel: 'Refresh devices' })
    expect(button.props['aria-label']).toBe('Refresh devices')
    expect(content(button).trim()).toBe('')
  })
})
