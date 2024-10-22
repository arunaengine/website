export default defineNuxtRouteMiddleware((to) => {
  // Always redirect to homepage if in maintenance mode
  if (useRuntimeConfig().public.maintenanceMode && to.path !== '/') {
    return navigateTo('/')
  }
})
