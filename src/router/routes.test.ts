import { afterEach, describe, expect, it, vi } from 'vitest'

interface AnyRoute {
  path: string
  name?: string
  component?: unknown
  redirect?: unknown
  beforeEnter?: () => unknown
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

// Installs a served config in the module graph the last build() made.
async function configure(raw: Record<string, unknown>): Promise<void> {
  const { applyPortalConfig } = await import('@/lib/config')
  applyPortalConfig(raw)
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
    const desktopOnly = ['device', 'folders', 'folders/:folderId', 'transfers', 'sync', 'activity', 'tools', 'runs', 'runs/:jobId']

    for (const path of desktopOnly) expect(child(routes, path)).toBeUndefined()
  })

  it('keeps the portal shell and dashboard', async () => {
    const routes = await build()

    await expect(resolved(find(routes, '/app'))).resolves.toBe('app-layout')
    await expect(resolved(child(routes, ''))).resolves.toBe('dashboard')
    expect(child(routes, '')?.name).toBe('dashboard')
  })

  it('uses uniform collection, item, create and edit route names', async () => {
    const routes = await build()
    const expected = [
      ['datasets', 'datasets'],
      ['datasets/new', 'dataset-new'],
      ['datasets/:id', 'dataset'],
      ['datasets/:id/edit', 'dataset-edit'],
      ['profiles', 'profiles'],
      ['profiles/new', 'profile-new'],
      ['profiles/:profileId', 'profile'],
      ['profiles/:profileId/edit', 'profile-edit'],
      ['groups', 'groups'],
      ['groups/:id', 'group'],
      ['users/:id', 'user'],
      ['jobs/:jobId', 'job'],
      ['notebooks', 'notebooks'],
      ['notebooks/:bucketId/:key(.*)', 'notebook'],
      ['compute/:taskId', 'task'],
    ]

    for (const [path, name] of expected) expect(child(routes, path)?.name).toBe(name)
  })

  it('redirects legacy dataset and job paths to their canonical routes', async () => {
    const routes = await build()
    const metadataRedirect = child(routes, 'metadata/:id')?.redirect as
      | ((to: { params: Record<string, string> }) => unknown)
      | undefined
    const jobRedirect = child(routes, 'compute/jobs/:jobId')?.redirect as
      | ((to: { params: Record<string, string> }) => unknown)
      | undefined

    expect(child(routes, 'search')?.redirect).toEqual({ name: 'datasets' })
    expect(child(routes, 'metadata')?.redirect).toEqual({ name: 'datasets' })
    expect(metadataRedirect?.({ params: { id: 'dataset-1' } })).toEqual({
      name: 'dataset',
      params: { id: 'dataset-1' },
    })
    expect(jobRedirect?.({ params: { jobId: 'job-1' } })).toEqual({
      name: 'job',
      params: { jobId: 'job-1' },
    })
  })

  it('opens an old node page as the node dialog on the Status page', async () => {
    const routes = await build()
    const node = child(routes, 'nodes/:nodeId')
    const redirect = node?.redirect as ((to: { params: Record<string, string> }) => unknown) | undefined

    expect(node?.name).toBe('node')
    expect(node?.component).toBeUndefined()
    expect(redirect?.({ params: { nodeId: 'store-1' } })).toEqual({ name: 'status', query: { node: 'store-1' } })
  })

  it('serves the public pages outside the app shell', async () => {
    const routes = await build()
    const expected = [
      ['/imprint', 'imprint'],
      ['/terms', 'terms'],
      ['/news', 'news'],
      ['/news/:slug', 'news-post'],
      ['/s/:node', 'share-visit'],
    ]

    for (const [path, name] of expected) {
      expect(find(routes, path)?.name).toBe(name)
      expect(typeof find(routes, path)?.component).toBe('function')
    }
  })

  it('opens the landing page and news unless the deployment is portal-only', async () => {
    const routes = await build()
    const guarded = ['/', '/news', '/news/:slug'].map((path) => find(routes, path)!)

    for (const route of guarded) expect(route.beforeEnter?.()).toBe(true)
    await configure({ landing: false })
    for (const route of guarded) expect(route.beforeEnter?.()).toEqual({ name: 'dashboard' })
  })

  it('keeps share links, callbacks, the federation popup and docs in portal-only mode', async () => {
    const routes = await build()
    await configure({ landing: false })

    for (const path of ['/s/:node', '/auth/callback', '/federation/popup']) {
      expect(find(routes, path)?.beforeEnter).toBeUndefined()
      expect(find(routes, path)?.redirect).toBeUndefined()
    }
    expect(child(routes, 'docs/v1/:topic?')?.name).toBe('docs')
  })

  it('sends old imprint and terms links to the matching document, else the dashboard', async () => {
    const routes = await build()
    const imprint = find(routes, '/imprint')!
    const terms = find(routes, '/terms')!

    expect(imprint.beforeEnter?.()).toEqual({ name: 'dashboard' })
    expect(terms.beforeEnter?.()).toEqual({ name: 'dashboard' })

    await configure({
      legal: [
        { label: 'Privacy', markdown: '# Privacy' },
        { label: 'Nutzungsbedingungen', markdown: '# Bedingungen' },
        { label: 'IMPRESSUM', markdown: '# Impressum' },
        { label: 'Terms of service', markdown: '# Terms' },
      ],
    })
    expect(imprint.beforeEnter?.()).toEqual({ name: 'legal', params: { n: '2' } })
    expect(terms.beforeEnter?.()).toEqual({ name: 'legal', params: { n: '1' } })
  })

  it('leaves for an imprint that is a page of its own', async () => {
    const routes = await build()
    const replace = vi.fn()
    vi.stubGlobal('window', { location: { replace } })
    await configure({ legal: [{ label: 'Imprint', url: 'https://uni.example.org/imprint' }] })

    expect(find(routes, '/imprint')?.beforeEnter?.()).toBe(false)
    expect(replace).toHaveBeenCalledWith('https://uni.example.org/imprint')
    expect(find(routes, '/terms')?.beforeEnter?.()).toEqual({ name: 'dashboard' })
  })

  it('shows Markdown legal documents inside the app shell', async () => {
    const routes = await build()
    const legal = child(routes, '/legal/:n')

    expect(legal?.name).toBe('legal')
    expect(typeof legal?.component).toBe('function')
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
    expect(root?.beforeEnter).toBeUndefined()
  })

  it('has no public pages', async () => {
    const routes = await build({ apiBaseUrl: '/api/v1' })

    for (const path of ['/imprint', '/terms', '/news', '/news/:slug', '/s/:node']) expect(find(routes, path)).toBeUndefined()
    expect(child(routes, '/legal/:n')).toBeUndefined()
  })

  it('mounts the device views', async () => {
    const routes = await build({ apiBaseUrl: '/api/v1' })
    const device = child(routes, 'device')

    expect(device?.name).toBe('device')
    expect(typeof device?.component).toBe('function')
  })

  it('mounts the folder page under the app shell', async () => {
    const routes = await build({ apiBaseUrl: '/api/v1' })

    expect(child(routes, 'folders/:folderId')?.name).toBe('folder')
    expect(typeof child(routes, 'folders/:folderId')?.component).toBe('function')
  })

  it('sends the old desktop pages to their new places', async () => {
    const routes = await build({ apiBaseUrl: '/api/v1' })
    const expected: Array<[string, unknown]> = [
      ['sync', { name: 'device' }],
      ['folders', { name: 'device' }],
      ['activity', { name: 'device' }],
      ['transfers', { name: 'device' }],
      ['tools', { name: 'settings', query: { tab: 'access' } }],
      ['runs', { name: 'compute' }],
    ]

    for (const [path, target] of expected) {
      expect(child(routes, path)?.redirect).toEqual(target)
      expect(child(routes, path)?.component).toBeUndefined()
    }
  })

  it('sends the old settings groups tab to the Groups page', async () => {
    const routes = await build()
    const settings = child(routes, 'settings') as AnyRoute & { beforeEnter: (to: { query: Record<string, string> }) => unknown }

    expect(settings.beforeEnter({ query: { tab: 'groups' } })).toEqual({ name: 'groups' })
    expect(settings.beforeEnter({ query: { tab: 'access' } })).toBe(true)
  })

  it('sends the old notebook and run template pages to their Compute tabs', async () => {
    const routes = await build()
    for (const path of ['notebooks', 'compute/notebooks']) {
      const redirect = child(routes, path)?.redirect as () => unknown
      expect(redirect()).toEqual({ name: 'compute', query: { tab: 'notebooks' } })
    }
    expect(child(routes, 'compute/saved')?.redirect).toEqual({ name: 'compute', query: { tab: 'templates' } })
    expect(child(routes, 'compute/templates')?.redirect).toEqual({ name: 'compute', query: { tab: 'templates' } })
    expect(child(routes, 'admin/jobs')?.redirect).toEqual({ path: '/app/admin', query: { tab: 'jobs' } })
  })

  it('opens an old run link in the Compute run drawer', async () => {
    const routes = await build({ apiBaseUrl: '/api/v1' })
    const run = child(routes, 'runs/:jobId')
    const redirect = run?.redirect as (to: { params: Record<string, string> }) => unknown

    expect(run?.name).toBe('run')
    expect(redirect({ params: { jobId: 'job-1' } })).toEqual({ name: 'task', params: { taskId: 'job-1' } })
  })

  it('swaps the shell and keeps the dashboard as home', async () => {
    const routes = await build({ apiBaseUrl: '/api/v1' })

    await expect(resolved(find(routes, '/app'))).resolves.toBe('desktop-layout')
    await expect(resolved(child(routes, ''))).resolves.toBe('dashboard')
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
