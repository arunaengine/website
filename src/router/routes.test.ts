import { afterEach, describe, expect, it, vi } from 'vitest'

interface AnyRoute {
  path: string
  name?: string
  component?: unknown
  redirect?: unknown
  children?: AnyRoute[]
}

// The desktop context is read once per module graph, so each case builds the
// route table in a graph of its own.
async function build(injected?: unknown): Promise<AnyRoute[]> {
  vi.resetModules()
  vi.stubGlobal('window', { __ARUNA_DESKTOP__: injected })
  const { portalRoutes } = await import('./routes')
  return portalRoutes() as unknown as AnyRoute[]
}

function find(routes: AnyRoute[], path: string): AnyRoute | undefined {
  return routes.find((route) => route.path === path)
}

function appChildren(routes: AnyRoute[]): AnyRoute[] {
  return find(routes, '/app')?.children ?? []
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('web routes', () => {
  it('serves the landing page as its own lazy chunk', async () => {
    const routes = await build()
    const root = find(routes, '/')

    expect(root?.name).toBe('landing')
    expect(root?.redirect).toBeUndefined()
    expect(typeof root?.component).toBe('function')
  })

  it('has no device views to reach', async () => {
    const routes = await build()
    expect(appChildren(routes).some((route) => route.path === 'device')).toBe(false)
  })
})

describe('desktop routes', () => {
  it('boots into the app shell instead of the landing page', async () => {
    const routes = await build({ apiBaseUrl: '/api/v1' })
    const root = find(routes, '/')

    expect(root?.redirect).toEqual({ name: 'dashboard' })
    expect(root?.name).toBeUndefined()
    expect(root?.component).toBeUndefined()
  })

  it('mounts the device views', async () => {
    const routes = await build({ apiBaseUrl: '/api/v1' })
    const device = appChildren(routes).find((route) => route.path === 'device')

    expect(device?.name).toBe('device')
    expect(typeof device?.component).toBe('function')
  })

  it('keeps the auth callback route', async () => {
    // The system-browser login returns through it, so it must survive the gate.
    const routes = await build({ apiBaseUrl: '/api/v1' })
    expect(find(routes, '/auth/callback')?.name).toBe('auth-callback')
  })
})
