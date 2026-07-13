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
      // Discover — the metadata catalog plus full-text search
      { path: 'search', name: 'search', component: () => import('@/views/SearchView.vue') },
      // SPARQL console — intentionally NOT auth-gated: guests query public graphs,
      // the backend applies visibility filtering.
      { path: 'query', name: 'query', component: () => import('@/views/QueryConsoleView.vue') },
      // The old catalog listing merged into Discover; detail pages stay here
      { path: 'metadata', name: 'metadata', redirect: { name: 'search' } },
      { path: 'metadata/:id', name: 'metadata-detail', component: () => import('@/views/MetadataView.vue') },
      // Profiles for RO-Crate metadata schemas
      { path: 'profiles', name: 'profiles', component: () => import('@/views/ProfilesView.vue') },
      { path: 'profiles/:profileId', name: 'profile-detail', component: () => import('@/views/ProfilesView.vue') },
      // Groups — dedicated management page
      { path: 'groups/:id?', name: 'groups', component: () => import('@/views/GroupsView.vue') },
      { path: 'status', name: 'status', component: () => import('@/views/StatusView.vue') },
      // Settings (consolidates account preferences, members, tokens)
      { path: 'settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
      // My devices (aruna#271) — the view self-gates on featureEnabled('deviceEnrollment')
      // and renders NotFoundView when the flag is off, since routes are registered
      // before the runtime config loads (gating cannot live here). The component is
      // lazy, so the flag is read at navigation time, after config load.
      { path: 'settings/devices', name: 'settings-devices', component: () => import('@/views/DevicesView.vue') },
      // Subscriptions / offline leases (aruna#273) — the view self-gates on
      // featureEnabled('subscriptions') and renders NotFoundView when the flag
      // is off (routes register before the runtime config loads; #271 pattern).
      { path: 'settings/subscriptions', name: 'settings-subscriptions', component: () => import('@/views/SubscriptionsView.vue') },
      // Realm admin — quota policy and realm-wide usage
      { path: 'admin', name: 'admin', component: () => import('@/views/AdminView.vue') },
      // Realm admin — node onboarding wizard and outstanding secrets
      { path: 'admin/onboarding', name: 'admin-onboarding', component: () => import('@/views/AdminOnboardingView.vue') },
      // Realm admin — placement defaults and transitions (feature-gated in-view)
      { path: 'admin/placement', name: 'admin-placement', component: () => import('@/views/AdminPlacementView.vue') },
      // Jobs — durable background jobs (feature-gated in-view; the backend
      // surface lives on aruna feat/job-framework)
      { path: 'jobs', name: 'jobs', component: () => import('@/views/JobsView.vue') },
      { path: 'jobs/:jobId', name: 'job-detail', component: () => import('@/views/JobsView.vue') },
      // Compute — GA4GH TES tasks (feature-gated in-view, aruna#290)
      { path: 'compute', name: 'compute', component: () => import('@/views/ComputeView.vue') },
      { path: 'compute/new', name: 'compute-new', component: () => import('@/views/ComputeSubmitView.vue') },
      { path: 'compute/:taskId', name: 'compute-task', component: () => import('@/views/ComputeView.vue') },
      // Compatibility redirects from prior IA
      { path: 'data', redirect: { name: 'buckets' } },
      { path: 'data/:bucketId', redirect: (to) => ({ name: 'bucket', params: { bucketId: to.params.bucketId } }) },
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
