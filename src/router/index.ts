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
      // Search — card-based by default, SPARQL in expert mode
      { path: 'search', name: 'search', component: () => import('@/views/SearchView.vue') },
      // Metadata catalog
      { path: 'metadata', name: 'metadata', component: () => import('@/views/MetadataView.vue') },
      { path: 'metadata/:id', name: 'metadata-detail', component: () => import('@/views/MetadataView.vue') },
      // Profiles for RO-Crate metadata schemas
      { path: 'profiles', name: 'profiles', component: () => import('@/views/ProfilesView.vue') },
      { path: 'profiles/:profileId', name: 'profile-detail', component: () => import('@/views/ProfilesView.vue') },
      // Groups — dedicated management page
      { path: 'groups/:id?', name: 'groups', component: () => import('@/views/GroupsView.vue') },
      // Settings (consolidates account preferences, members, tokens)
      { path: 'settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
      // Compatibility redirects from prior IA
      { path: 'data', redirect: { name: 'buckets' } },
      { path: 'data/:bucketId', redirect: (to) => ({ name: 'bucket', params: { bucketId: to.params.bucketId } }) },
      { path: 'query', redirect: { name: 'search' } },
      { path: 'nodes', redirect: { name: 'settings' } },
      { path: 'realm', redirect: { name: 'settings' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
