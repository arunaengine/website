import type { RouteRecordRaw } from 'vue-router'
import { isDesktop } from '@/lib/desktop'

// The shell has no marketing surface, so '/' boots into the app shell, which
// renders the signed-in views or its own sign-in prompt. LandingView stays a
// lazy chunk either way, so the web build is untouched.
function landingRoute(): RouteRecordRaw {
  if (isDesktop()) return { path: '/', redirect: { name: 'dashboard' } }
  return { path: '/', name: 'landing', component: () => import('@/views/LandingView.vue') }
}

// One frontend, two shells: Aruna Desktop mounts a layout built around the
// machine, the web keeps the portal layout. Both lazy, so neither build carries
// the other's chunk.
function appLayout() {
  return isDesktop() ? import('@/views/DesktopLayout.vue') : import('@/views/AppLayout.vue')
}

// Home of the app shell: the machine in desktop mode, the realm dashboard on
// the web. The route name stays 'dashboard' for every link that points at it.
function homeRoute(): RouteRecordRaw {
  return {
    path: '',
    name: 'dashboard',
    component: isDesktop()
      ? () => import('@/views/desktop/DesktopHomeView.vue')
      : () => import('@/views/DashboardView.vue'),
  }
}

// Views that drive the node the shell embeds; a browser tab has no access to it.
function desktopRoutes(): RouteRecordRaw[] {
  if (!isDesktop()) return []
  return [
    { path: 'sync', name: 'sync', component: () => import('@/views/desktop/SyncView.vue') },
    {
      path: 'folders/:folderId',
      name: 'folder',
      component: () => import('@/views/desktop/FolderDetailView.vue'),
    },
    // The old folder and transfer paths stay reachable through Sync.
    { path: 'folders', redirect: { name: 'sync' } },
    { path: 'transfers', redirect: { name: 'sync' } },
    { path: 'runs', name: 'runs', component: () => import('@/views/desktop/RunsView.vue') },
    { path: 'runs/:jobId', name: 'run', component: () => import('@/views/desktop/RunsView.vue') },
    { path: 'device', name: 'device', component: () => import('@/views/DeviceView.vue') },
  ]
}

/** Built per boot: desktop mode swaps the landing route for the app shell. */
export function portalRoutes(): RouteRecordRaw[] {
  return [
    landingRoute(),
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('@/views/AuthCallbackView.vue'),
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
        // Buckets: primary research surface (formerly "Data manager")
        { path: 'buckets', name: 'buckets', component: () => import('@/views/DataManagerView.vue') },
        { path: 'buckets/:bucketId', name: 'bucket', component: () => import('@/views/DataManagerView.vue') },
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
        // Datasets catalog plus search, with SPARQL in expert mode.
        { path: 'datasets', name: 'datasets', component: () => import('@/views/SearchView.vue') },
        { path: 'datasets/new', name: 'dataset-new', component: () => import('@/views/DatasetNewView.vue') },
        { path: 'datasets/:id', name: 'dataset', component: () => import('@/views/MetadataView.vue') },
        { path: 'datasets/:id/edit', name: 'dataset-edit', component: () => import('@/views/DatasetEditView.vue') },
        { path: 'search', redirect: { name: 'datasets' } },
        { path: 'metadata', redirect: { name: 'datasets' } },
        {
          path: 'metadata/:id',
          redirect: (to) => ({ name: 'dataset', params: { id: to.params.id } }),
        },
        // Profiles for RO-Crate metadata schemas
        { path: 'profiles', name: 'profiles', component: () => import('@/views/ProfilesView.vue') },
        { path: 'profiles/:profileId', name: 'profile', component: () => import('@/views/ProfilesView.vue') },
        // Versioned, repository-owned portal guidance.
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
        { path: 'settings/watches', name: 'settings-watches', component: () => import('@/views/WatchesView.vue') },
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
        // Compute: GA4GH TES tasks and durable system jobs in one surface
        // (each half is feature-gated in-view)
        { path: 'compute', name: 'compute', component: () => import('@/views/ComputeView.vue') },
        { path: 'compute/quick', name: 'compute-quick', component: () => import('@/views/ComputeQuickRunView.vue') },
        { path: 'compute/new', name: 'compute-new', component: () => import('@/views/ComputeSubmitView.vue') },
        { path: 'compute/jobs', redirect: { name: 'compute', query: { tab: 'jobs' } } },
        {
          path: 'compute/jobs/:jobId',
          redirect: (to) => ({ name: 'job', params: { jobId: to.params.jobId } }),
        },
        { path: 'compute/:taskId', name: 'task', component: () => import('@/views/ComputeView.vue') },
        // Compatibility redirects from prior IA
        { path: 'jobs', redirect: { name: 'compute', query: { tab: 'jobs' } } },
        { path: 'jobs/:jobId', name: 'job', component: () => import('@/views/ComputeView.vue') },
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
