export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    // Check if requests logging is enabled in config
    if (useRuntimeConfig().logRequests) {
      // Log all requests, except nuxt logic and sensitive callback info
      if (!event.path.includes('_nuxt') && !event.path.includes('/callback')) {
        console.log('[KPI]', event.method, event.path)
      }
    }
  })
})
