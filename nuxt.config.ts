// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  experimental: {
    clientNodeCompat: true
  },
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
    logRequests: true,
    mailingListHost: 'https://mailing-lists.example.de',
    mailingListUrl: 'https://mailing-lists.example.de/lists/aruna/',
    mailingListSubscribe: 'https://mailing-lists.example.de/lists/aruna/anonymous_subscribe',
    provider: {
      local: {
        clientId: "test",
        clientSecret: "QgBl9I2CD3eVhL7LFvkHrYUK7oKL3LE2",
        serverUrl: "http://localhost:1998",
        redirectUrl: "http://localhost:3000/callback",
        realm: "test",
        scope: ["openid"],
      }
    }
  },
})

