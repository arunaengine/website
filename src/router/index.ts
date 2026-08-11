import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'landing',
    component: () => import('@/views/LandingView.vue'),
  },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('@/views/AuthCallbackView.vue'),
  },
  {
    path: '/app',
    component: () => import('@/views/AppLayout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
      // Buckets — primary research surface (formerly "Data manager")
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
      // Discover — the metadata catalog plus search, SPARQL in expert mode
      { path: 'search', name: 'search', component: () => import('@/views/SearchView.vue') },
      // The old catalog listing merged into Discover; detail pages stay here
      { path: 'metadata', name: 'metadata', redirect: { name: 'search' } },
      { path: 'metadata/:id', name: 'metadata-detail', component: () => import('@/views/MetadataView.vue') },
      // Profiles for RO-Crate metadata schemas
      { path: 'profiles', name: 'profiles', component: () => import('@/views/ProfilesView.vue') },
      { path: 'profiles/:profileId', name: 'profile-detail', component: () => import('@/views/ProfilesView.vue') },
      // Groups — dedicated management page
      { path: 'groups/:id?', name: 'groups', component: () => import('@/views/GroupsView.vue') },
      // Public user profile resolved from the realm's user directory
      { path: 'users/:id', name: 'user-profile', component: () => import('@/views/UserProfileView.vue') },
      { path: 'status', name: 'status', component: () => import('@/views/StatusView.vue') },
      // Settings (consolidates account preferences, members, tokens)
      { path: 'settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
      // Watched resources — served by the merged notifications backend, so no
      // feature flag; the view degrades inline when the endpoints are absent.
      { path: 'settings/watches', name: 'settings-watches', component: () => import('@/views/WatchesView.vue') },
      // Realm admin — usage, quota policy and placement (tabs of one view)
      { path: 'admin', name: 'admin', component: () => import('@/views/AdminView.vue') },
      { path: 'admin/placement', redirect: { path: '/app/admin', query: { tab: 'placement' } } },
      // Realm admin — read-only user directory
      { path: 'admin/users', name: 'admin-users', component: () => import('@/views/AdminUsersView.vue') },
      // Realm admin — node onboarding secrets (management nodes only)
      {
        path: 'admin/onboarding',
        name: 'admin-onboarding',
        component: () => import('@/views/AdminOnboardingView.vue'),
      },
      // Realm admin — rejected replicated sync events held by this node
      {
        path: 'admin/quarantine',
        name: 'admin-quarantine',
        component: () => import('@/views/AdminQuarantineView.vue'),
      },
      // Compute — GA4GH TES tasks and durable system jobs in one surface
      // (each half is feature-gated in-view)
      { path: 'compute', name: 'compute', component: () => import('@/views/ComputeView.vue') },
      { path: 'compute/quick', name: 'compute-quick', component: () => import('@/views/ComputeQuickRunView.vue') },
      { path: 'compute/new', name: 'compute-new', component: () => import('@/views/ComputeSubmitView.vue') },
      { path: 'compute/jobs', redirect: { name: 'compute', query: { tab: 'jobs' } } },
      { path: 'compute/jobs/:jobId', name: 'job-detail', component: () => import('@/views/ComputeView.vue') },
      { path: 'compute/:taskId', name: 'compute-task', component: () => import('@/views/ComputeView.vue') },
      // Compatibility redirects from prior IA
      { path: 'jobs', redirect: { name: 'compute', query: { tab: 'jobs' } } },
      { path: 'jobs/:jobId', redirect: (to) => ({ name: 'job-detail', params: { jobId: to.params.jobId } }) },
      { path: 'data', redirect: { name: 'buckets' } },
      { path: 'data/:bucketId', redirect: (to) => ({ name: 'bucket', params: { bucketId: to.params.bucketId } }) },
      { path: 'query', redirect: { name: 'search' } },
      { path: 'nodes', redirect: { name: 'settings' } },
      { path: 'realm', redirect: { name: 'settings' } },
      // Unknown /app URLs keep the shell and show a 404 instead of redirecting away.
      { path: ':pathMatch(.*)*', name: 'app-not-found', component: () => import('@/views/NotFoundView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
]

function hashTargetExists(hash: string): boolean {
  try {
    return Boolean(document.querySelector(hash))
  } catch {
    return false
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) {
      // Wait a tick so freshly mounted views can render the target element.
      return new Promise((resolve) => {
        window.setTimeout(() => {
          if (hashTargetExists(to.hash)) {
            resolve({ el: to.hash, top: 72, behavior: 'smooth' })
          } else {
            resolve({ top: 0 })
          }
        }, 0)
      })
    }
    return { top: 0 }
  },
})

export default router
