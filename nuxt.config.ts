// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  css: [
    '~/assets/styles/main.scss',
    '~/assets/styles/tabler.min_v4.css',
  ],
  app: {
    head: {
      script: [{
        src: 'js/tabler.min_v4.js'
      }]
    }
  }
})

