import type { RouteLocationRaw, RouteRecordRaw } from 'vue-router'
import { portalConfig } from '@/lib/config'
import { isDesktop } from '@/lib/desktop'

// A portal-only deployment has no landing page and no news; both open the dashboard.
function landingGuard(): RouteLocationRaw | true {
  return portalConfig().landing ? true : { name: 'dashboard' }
}

// Old /imprint and /terms links open the first document whose label names them, else the dashboard.
function legalGuard(words: string[]) {
  return (): RouteLocationRaw | false => {
    const legal = portalConfig().legal
    const index = legal.findIndex((item) => words.some((word) => item.label.toLowerCase().includes(word)))
    const target = legal[index]
    if (!target) return { name: 'dashboard' }
    if ('markdown' in target) return { name: 'legal', params: { n: String(index) } }
    window.location.replace(target.url)
    return false
  }
}

// The shell has no marketing surface, so '/' boots into the app shell, which
// renders the signed-in views or its own sign-in prompt. LandingView stays a
// lazy chunk either way, so the web build is untouched.
function landingRoute(): RouteRecordRaw {
  if (isDesktop()) return { path: '/', redirect: { name: 'dashboard' } }
  return { path: '/', name: 'landing', component: () => import('@/views/LandingView.vue'), beforeEnter: landingGuard }
}

// Public pages beside the landing page; the shell has no marketing surface.
function publicRoutes(): RouteRecordRaw[] {
  if (isDesktop()) return []
  return [
    // The guards always leave these two; the component is only the record's required target.
    {
      path: '/imprint',
      name: 'imprint',
      component: () => import('@/views/NotFoundView.vue'),
      beforeEnter: legalGuard(['imprint', 'impressum']),
    },
    {
      path: '/terms',
      name: 'terms',
      component: () => import('@/views/NotFoundView.vue'),
      beforeEnter: legalGuard(['terms', 'nutzungsbedingungen']),
    },
    { path: '/news', name: 'news', component: () => import('@/views/NewsView.vue'), beforeEnter: landingGuard },
    { path: '/news/:slug', name: 'news-post', component: () => import('@/views/NewsPostView.vue'), beforeEnter: landingGuard },
    // A share link opens without an account, outside the app shell; its token is in the fragment.
    { path: '/s/:node', name: 'share-visit', component: () => import('@/views/ShareVisitView.vue') },
  ]
}

// A legal document the node serves as Markdown, shown inside the app shell.
function legalRoutes(): RouteRecordRaw[] {
  if (isDesktop()) return []
  return [{ path: '/legal/:n', name: 'legal', component: () => import('@/views/LegalView.vue') }]
}

// One frontend, two shells: Aruna Desktop mounts a layout built around the
// machine, the web keeps the portal layout. Both lazy, so neither build carries
// the other's chunk.
function appLayout() {
  return isDesktop() ? import('@/views/DesktopLayout.vue') : import('@/views/AppLayout.vue')
}

// Home of the app shell, on the web and in the desktop; the desktop adds its
// own cards inside the view.
function homeRoute(): RouteRecordRaw {
  return { path: '', name: 'dashboard', component: () => import('@/views/DashboardView.vue') }
}

// Views that drive the node the shell embeds; a browser tab has no access to it.
function desktopRoutes(): RouteRecordRaw[] {
  if (!isDesktop()) return []
  return [
    {
      path: 'folders/:folderId',
      name: 'folder',
      component: () => import('@/views/desktop/FolderDetailView.vue'),
    },
    // The old Sync, Activity, Tools and Runs pages live in the plain sections now.
    { path: 'sync', redirect: { name: 'device' } },
    { path: 'folders', redirect: { name: 'device' } },
    { path: 'activity', redirect: { name: 'device' } },
    { path: 'transfers', redirect: { name: 'device' } },
    { path: 'tools', redirect: { name: 'settings', query: { tab: 'access' } } },
    { path: 'runs', redirect: { name: 'compute' } },
    // A run's TES task id is its job id, so a local run opens in the Compute drawer.
    {
      path: 'runs/:jobId',
      name: 'run',
      redirect: (to) => ({ name: 'task', params: { taskId: to.params.jobId } }),
    },
    { path: 'device', name: 'device', component: () => import('@/views/DeviceView.vue') },
  ]
}

/** Built per boot: desktop mode swaps the landing route for the app shell. */
export function portalRoutes(): RouteRecordRaw[] {
  return [
    landingRoute(),
    ...publicRoutes(),
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('@/views/AuthCallbackView.vue'),
    },
    // Opened by another realm's portal; the node keeps its opener link under /federation/.
    {
      path: '/federation/popup',
      name: 'federation-popup',
      component: () => import('@/views/FederationPopupView.vue'),
    },
    // Desktop first run: outside the app shell, because with no realm behind it
    // the shell's navigation has nothing to link to.
    ...(isDesktop()
      ? [
          { path: '/welcome', name: 'welcome', component: () => import('@/views/WelcomeView.vue') },
          {
            path: '/welcome/sign-in',
            name: 'welcome-sign-in',
            component: () => import('@/views/WelcomeSignInView.vue'),
          },
          {
            path: '/welcome/device',
            name: 'welcome-device',
            component: () => import('@/views/WelcomeDeviceView.vue'),
          },
        ]
      : []),
    {
      path: '/app',
      component: appLayout,
      children: [
        homeRoute(),
        // Data: buckets and objects, the primary research surface.
        { path: 'buckets', name: 'buckets', component: () => import('@/views/DataManagerView.vue') },
        {
          path: 'buckets/:bucketId',
          name: 'bucket',
          component: () => import('@/views/DataManagerView.vue'),
          beforeEnter: (to) => import('./bucketNode').then((module) => module.bucketNodeRoute(to)),
        },
        // Everything one bucket stores: backend, placement policies and syncs.
        {
          path: 'buckets/:bucketId/storage',
          name: 'bucket-storage',
          component: () => import('@/views/BucketStorageView.vue'),
        },
        // Retired bucket-builder route: the consolidated Add data dialog replaced
        // the full-page builder; old links land in the bucket view with it open.
        {
          path: 'buckets/:bucketId/builder',
          redirect: (to) => ({
            name: 'bucket',
            params: { bucketId: to.params.bucketId },
            query: { ...(typeof to.query.prefix === 'string' && to.query.prefix ? { prefix: to.query.prefix } : {}), addData: '1' },
          }),
        },
        // Dataset catalog plus search, with SPARQL in expert mode.
        { path: 'datasets', name: 'datasets', component: () => import('@/views/SearchView.vue') },
        { path: 'datasets/new', name: 'dataset-new', component: () => import('@/views/DatasetEditorView.vue') },
        { path: 'datasets/presets', name: 'presets', component: () => import('@/views/PresetsView.vue') },
        { path: 'datasets/:id', name: 'dataset', component: () => import('@/views/MetadataView.vue') },
        { path: 'datasets/:id/edit', name: 'dataset-edit', component: () => import('@/views/DatasetEditorView.vue') },
        { path: 'search', redirect: { name: 'datasets' } },
        // The assistant on a page of its own; the floating panel shares its chat.
        { path: 'assistant', name: 'assistant', component: () => import('@/views/AssistantView.vue') },
        { path: 'metadata', redirect: { name: 'datasets' } },
        {
          path: 'metadata/:id',
          redirect: (to) => ({ name: 'dataset', params: { id: to.params.id } }),
        },
        // Profiles for RO-Crate metadata schemas
        { path: 'profiles', name: 'profiles', component: () => import('@/views/ProfilesView.vue'), meta: { feature: 'profiles' } },
        { path: 'profiles/new', name: 'profile-new', component: () => import('@/views/ProfileNewView.vue'), meta: { feature: 'profiles' } },
        { path: 'profiles/:profileId', name: 'profile', component: () => import('@/views/ProfilesView.vue'), meta: { feature: 'profiles' } },
        { path: 'profiles/:profileId/edit', name: 'profile-edit', component: () => import('@/views/ProfileNewView.vue'), meta: { feature: 'profiles' } },
        // Versioned, repository-owned portal guidance. The static api path wins
        // over the topic param, so the reference never collides with a slug.
        {
          path: 'docs/v1/api',
          name: 'api-reference',
          component: () => import('@/views/ApiReferenceView.vue'),
        },
        { path: 'docs/v1/:topic?', name: 'docs', component: () => import('@/views/DocsView.vue') },
        // Groups: dedicated management page
        { path: 'groups', name: 'groups', component: () => import('@/views/GroupsView.vue') },
        { path: 'groups/:id', name: 'group', component: () => import('@/views/GroupsView.vue') },
        // Public user profile resolved from the realm's user directory
        { path: 'users/:id', name: 'user', component: () => import('@/views/UserProfileView.vue') },
        { path: 'status', name: 'status', component: () => import('@/views/StatusView.vue') },
        // A node opens as a dialog on the Status page; links by this name land there.
        { path: 'nodes/:nodeId', name: 'node', redirect: (to) => ({ name: 'status', query: { node: String(to.params.nodeId) } }) },
        ...desktopRoutes(),
        ...legalRoutes(),
        // Settings (consolidates account preferences, members, tokens)
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
          // The groups tab became the Groups page.
          beforeEnter: (to) => (to.query.tab === 'groups' ? { name: 'groups' } : true),
        },
        // Watched resources: served by the merged notifications backend, so no
        // feature flag; the view degrades inline when the endpoints are absent.
        { path: 'settings/watches', name: 'settings-watches', component: () => import('@/views/WatchesView.vue'), meta: { feature: 'watches' } },
        // Realm admin: usage, quota policy and placement (tabs of one view)
        { path: 'admin', name: 'admin', component: () => import('@/views/AdminView.vue') },
        { path: 'admin/placement', redirect: { path: '/app/admin', query: { tab: 'placement' } } },
        { path: 'admin/jobs', redirect: { path: '/app/admin', query: { tab: 'jobs' } } },
        // Realm admin: read-only user directory
        { path: 'admin/users', name: 'admin-users', component: () => import('@/views/AdminUsersView.vue') },
        // Realm admin: node onboarding secrets (management nodes only)
        {
          path: 'admin/onboarding',
          name: 'admin-onboarding',
          component: () => import('@/views/AdminOnboardingView.vue'),
        },
        // Realm admin: rejected replicated sync events held by this node
        {
          path: 'admin/quarantine',
          name: 'admin-quarantine',
          component: () => import('@/views/AdminQuarantineView.vue'),
        },
        // Interactive tutorials: the real views, driven by fixtures.
        {
          path: 'tutorial/compute',
          name: 'tutorial-compute',
          component: () => import('@/views/TutorialComputeView.vue'),
        },
        {
          path: 'tutorial/profile',
          name: 'tutorial-profile',
          component: () => import('@/views/TutorialProfileView.vue'),
        },
        // Compute: runs and durable system jobs in one surface
        // (each half is feature-gated in-view)
        { path: 'compute', name: 'compute', component: () => import('@/views/ComputeView.vue'), meta: { feature: 'compute' } },
        // The quick run wizard is gone; its link opens the Python template.
        { path: 'compute/quick', redirect: { name: 'compute-new', query: { template: 'python' } } },
        { path: 'compute/new', name: 'compute-new', component: () => import('@/views/ComputeSubmitView.vue'), meta: { feature: 'compute' } },
        // Notebooks are a tab of Compute; the old entry and its links land there.
        { path: 'notebooks', name: 'notebooks', redirect: () => ({ name: 'compute', query: { tab: 'notebooks' } }) },
        { path: 'compute/notebooks', redirect: () => ({ name: 'compute', query: { tab: 'notebooks' } }) },
        // One notebook, named by the bucket it works in and its object key.
        {
          path: 'notebooks/:bucketId/:key(.*)',
          name: 'notebook',
          component: () => import('@/views/NotebookView.vue'),
          meta: { feature: 'notebooks' },
        },
        { path: 'compute/templates', redirect: { name: 'compute', query: { tab: 'templates' } } },
        { path: 'compute/saved', redirect: { name: 'compute', query: { tab: 'templates' } } },
        { path: 'compute/jobs', redirect: { name: 'compute', query: { tab: 'jobs' } } },
        {
          path: 'compute/jobs/:jobId',
          redirect: (to) => ({ name: 'job', params: { jobId: to.params.jobId } }),
        },
        { path: 'compute/:taskId', name: 'task', component: () => import('@/views/ComputeView.vue'), meta: { feature: 'compute' } },
        // Compatibility redirects from prior IA
        { path: 'jobs', redirect: { name: 'compute', query: { tab: 'jobs' } } },
        { path: 'jobs/:jobId', name: 'job', component: () => import('@/views/ComputeView.vue'), meta: { feature: 'compute' } },
        { path: 'data', redirect: { name: 'buckets' } },
        { path: 'data/:bucketId', redirect: (to) => ({ name: 'bucket', params: { bucketId: to.params.bucketId } }) },
        { path: 'query', redirect: { name: 'datasets' } },
        { path: 'nodes', redirect: { name: 'settings' } },
        { path: 'realm', redirect: { name: 'settings' } },
        // Unknown /app URLs keep the shell and show a 404 instead of redirecting away.
        { path: ':pathMatch(.*)*', name: 'app-not-found', component: () => import('@/views/NotFoundView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
  ]
}
