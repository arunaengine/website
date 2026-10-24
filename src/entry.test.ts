import { afterEach, describe, expect, it, vi } from 'vitest'

interface FakeNode {
  tag: string
  className: string
  textContent: string
  href?: string
  children: FakeNode[]
  append: (...nodes: FakeNode[]) => void
  replaceChildren: (...nodes: FakeNode[]) => void
}

function fakeNode(tag: string): FakeNode {
  const node: FakeNode = {
    tag,
    className: '',
    textContent: '',
    children: [],
    append: (...nodes) => void node.children.push(...nodes),
    replaceChildren: (...nodes) => void (node.children = nodes),
  }
  return node
}

function nodes(node: FakeNode): FakeNode[] {
  return [node, ...node.children.flatMap(nodes)]
}

// Storage throws as in a browser that blocks it: the hand-off must not need it.
async function load(location: { pathname: string; search: string; hash?: string }, shell?: unknown) {
  vi.resetModules()
  const booted = vi.fn()
  vi.doMock('./main', () => {
    booted()
    return {}
  })
  const replace = vi.fn()
  const blocked = (): never => {
    throw new Error('storage is blocked')
  }
  vi.stubGlobal('window', {
    location: { hash: '', ...location, replace },
    __ARUNA_DESKTOP__: shell,
    get localStorage() {
      return blocked()
    },
    get sessionStorage() {
      return blocked()
    },
  })
  const root = fakeNode('div')
  vi.stubGlobal('document', { createElement: fakeNode, getElementById: (id: string) => (id === 'app' ? root : null) })
  await import('./entry')
  await vi.dynamicImportSettled()
  return { booted, replace, root }
}

afterEach(() => {
  vi.doUnmock('./main')
  vi.unstubAllGlobals()
})

describe('the portal entry', () => {
  it('hands a marked callback on to the app before the portal boots', async () => {
    const search = '?state=desktop.s1&session_state=x&iss=https%3A%2F%2Fidp.test%2Frealms%2Fv3&code=a.b%2Bc'
    const { booted, replace, root } = await load({ pathname: '/auth/callback', search, hash: '#kept' })

    const target = `aruna://auth/callback${search}#kept`
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith(target)
    expect(booted).not.toHaveBeenCalled()
    const rendered = nodes(root)
    expect(rendered.map((node) => node.textContent).filter(Boolean)).toEqual([
      'Continue in Aruna Desktop',
      'Your sign-in is done. Aruna Desktop completes it.',
      'Open Aruna Desktop',
      'You can close this window afterwards.',
    ])
    expect(rendered.find((node) => node.tag === 'a')?.href).toBe(target)
  })

  it('hands a refusal on to the app as well', async () => {
    const search = '?error=access_denied&error_description=User%20cancelled&state=desktop.s1'
    const { booted, replace } = await load({ pathname: '/auth/callback', search })

    expect(replace).toHaveBeenCalledWith(`aruna://auth/callback${search}`)
    expect(booted).not.toHaveBeenCalled()
  })

  it.each([
    ['an unmarked web callback', { pathname: '/auth/callback', search: '?code=c1&state=s1' }, undefined],
    ['a marked state on another page', { pathname: '/app', search: '?state=desktop.s1' }, undefined],
    ['a marked callback inside the desktop', { pathname: '/auth/callback', search: '?state=desktop.s1' }, { apiBaseUrl: '/api' }],
  ])('boots the portal for %s', async (_, location, shell) => {
    const { booted, replace, root } = await load(location, shell)

    expect(booted).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
    expect(root.children).toEqual([])
  })
})
