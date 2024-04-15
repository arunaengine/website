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
    serverHostUrl: "http://localhost:8080",
    provider: {
      local: {
        clientId: "test",
        clientSecret: "QgBl9I2CD3eVhL7LFvkHrYUK7oKL3LE2",
        serverUrl: "http://localhost:1998",
        redirectUrl: "http://localhost:3000/auth/callback",
        realm: "test",
        scope: ["openid"],
      }
    }
  },
})

