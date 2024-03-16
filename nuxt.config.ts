// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  plugins: [
    "~/plugins/preline.client.ts",
  ],
  modules: [
    '@nuxtjs/color-mode',
  ],
  css: [
    '~/assets/styles/main.css',
  ],
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  app: {
    head: {
      title: 'Aruna',
    }
  },
  
  colorMode: {
    classSuffix: '',
    preference: 'light',
    fallback: 'light',
  },

  runtimeConfig: {
    serverHostUrl: "http://localhost:8080"
  },
})

