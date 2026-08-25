import { afterEach, describe, expect, it, vi } from 'vitest'

interface AnyRoute {
  path: string
  name?: string
  component?: unknown
  redirect?: unknown
  children?: AnyRoute[]
}

// The desktop context is read once per module graph, so each case builds the
// route table in a graph of its own. The swapped views are stubbed: the table
// is what is under test, not what the views pull in.
async function build(injected?: unknown): Promise<AnyRoute[]> {
  vi.resetModules()
  vi.stubGlobal('window', { __ARUNA_DESKTOP__: injected })
  vi.doMock('@/views/DesktopLayout.vue', () => ({ default: 'desktop-layout' }))
  vi.doMock('@/views/AppLayout.vue', () => ({ default: 'app-layout' }))
  vi.doMock('@/views/desktop/DesktopHomeView.vue', () => ({ default: 'desktop-home' }))
  vi.doMock('@/views/DashboardView.vue', () => ({ default: 'dashboard' }))
  const { portalRoutes } = await import('./routes')
  return portalRoutes() as unknown as AnyRoute[]
}

async function resolved(route: AnyRoute | undefined): Promise<unknown> {
  const load = route?.component as (() => Promise<{ default: unknown }>) | undefined
  return load ? (await load()).default : undefined
}

function child(routes: AnyRoute[], path: string): AnyRoute | undefined {
  return appChildren(routes).find((route) => route.path === path)
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
    const desktopOnly = ['device', 'folders', 'folders/:folderId', 'transfers', 'runs', 'runs/:jobId']

    for (const path of desktopOnly) expect(child(routes, path)).toBeUndefined()
  })

  it('keeps the portal shell and dashboard', async () => {
    const routes = await build()

    await expect(resolved(find(routes, '/app'))).resolves.toBe('app-layout')
    await expect(resolved(child(routes, ''))).resolves.toBe('dashboard')
    expect(child(routes, '')?.name).toBe('dashboard')
  })

  it('mounts no welcome view', async () => {
    const routes = await build()
    expect(find(routes, '/welcome')).toBeUndefined()
    expect(find(routes, '/welcome/sign-in')).toBeUndefined()
    expect(find(routes, '/welcome/device')).toBeUndefined()
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
    const device = child(routes, 'device')

    expect(device?.name).toBe('device')
    expect(typeof device?.component).toBe('function')
  })

  it('mounts the machine views under the app shell', async () => {
    const routes = await build({ apiBaseUrl: '/api/v1' })
    const expected = [
      ['folders', 'folders'],
      ['folders/:folderId', 'folder'],
      ['transfers', 'transfers'],
      ['runs', 'runs'],
      ['runs/:jobId', 'run-detail'],
    ]

    for (const [path, name] of expected) {
      expect(child(routes, path)?.name).toBe(name)
      expect(typeof child(routes, path)?.component).toBe('function')
    }
  })

  it('swaps the shell and the home view, keeping the dashboard name', async () => {
    const routes = await build({ apiBaseUrl: '/api/v1' })

    await expect(resolved(find(routes, '/app'))).resolves.toBe('desktop-layout')
    await expect(resolved(child(routes, ''))).resolves.toBe('desktop-home')
    expect(child(routes, '')?.name).toBe('dashboard')
  })

  it('mounts the welcome view outside the app shell', async () => {
    const routes = await build({ apiBaseUrl: '/api/v1' })
    const welcome = find(routes, '/welcome')

    expect(welcome?.name).toBe('welcome')
    expect(typeof welcome?.component).toBe('function')
  })

  it('mounts the first run steps outside the app shell', async () => {
    // Sign-in and device setup precede the shell, which has nothing to link to.
    const routes = await build({ apiBaseUrl: '/api/v1' })

    expect(find(routes, '/welcome/sign-in')?.name).toBe('welcome-sign-in')
    expect(find(routes, '/welcome/device')?.name).toBe('welcome-device')
    expect(appChildren(routes).some((route) => route.name === 'welcome-sign-in')).toBe(false)
  })

  it('keeps the auth callback route', async () => {
    // The system-browser login returns through it, so it must survive the gate.
    const routes = await build({ apiBaseUrl: '/api/v1' })
    expect(find(routes, '/auth/callback')?.name).toBe('auth-callback')
  })
})
