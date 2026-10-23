import type { RouteRecordRaw } from 'vue-router'
import { isDesktop } from '@/lib/desktop'
import { distributedMockRoutes } from './distributedMock'

// The shell has no marketing surface, so '/' boots into the app shell, which
// renders the signed-in views or its own sign-in prompt. LandingView stays a
// lazy chunk either way, so the web build is untouched.
function landingRoute(): RouteRecordRaw {
  if (isDesktop()) return { path: '/', redirect: { name: 'dashboard' } }
  return { path: '/', name: 'landing', component: () => import('@/views/LandingView.vue') }
}

// Public pages beside the landing page; the shell has no marketing surface.
function publicRoutes(): RouteRecordRaw[] {
  if (isDesktop()) return []
  return [
    { path: '/imprint', name: 'imprint', component: () => import('@/views/ImprintView.vue') },
    { path: '/terms', name: 'terms', component: () => import('@/views/TermsView.vue') },
    { path: '/news', name: 'news', component: () => import('@/views/NewsView.vue') },
    { path: '/news/:slug', name: 'news-post', component: () => import('@/views/NewsPostView.vue') },
  ]
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
        { path: 'buckets/:bucketId', name: 'bucket', component: () => import('@/views/DataManagerView.vue') },
        // Everything one bucket stores: backend, placement policies and syncs.
        {
          path: 'buckets/:bucketId/storage',
          name: 'bucket-storage',
          component: () => import('@/views/BucketStorageView.vue'),
        },
        // Design mock with example data; only opens when its feature flag is on.
        distributedMockRoutes(),
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
        ...desktopRoutes(),
        // Settings (consolidates account preferences, members, tokens)
        { path: 'settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
        // Watched resources: served by the merged notifications backend, so no
        // feature flag; the view degrades inline when the endpoints are absent.
        { path: 'settings/watches', name: 'settings-watches', component: () => import('@/views/WatchesView.vue'), meta: { feature: 'watches' } },
        // Realm admin: usage, quota policy and placement (tabs of one view)
        { path: 'admin', name: 'admin', component: () => import('@/views/AdminView.vue') },
        { path: 'admin/placement', redirect: { path: '/app/admin', query: { tab: 'placement' } } },
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
        { path: 'notebooks', name: 'notebooks', component: () => import('@/views/NotebooksView.vue'), meta: { feature: 'notebooks' } },
        // One notebook, named by the bucket it works in and its object key.
        {
          path: 'notebooks/:bucketId/:key(.*)',
          name: 'notebook',
          component: () => import('@/views/NotebookView.vue'),
          meta: { feature: 'notebooks' },
        },
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
