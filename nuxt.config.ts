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
    terminologyService: {
      host: 'https://terminology.tib.eu/ts',
      api: 'https://service.tib.eu/ts4tib/api'
    },
    cache: {
      maxAge: 60 * 60 * 24, // 1 day
    },
    provider: {
      local: {
        clientId: "test",
        clientSecret: "QgBl9I2CD3eVhL7LFvkHrYUK7oKL3LE2",
        serverUrl: "http://localhost:1998",
        redirectUrl: "http://localhost:3000/callback",
        realm: "test",
        scope: ["openid"],
      }
    },
    markdownCss: {
      h1: ['text-3xl', 'font-bold', 'text-center', 'text-gray-700', 'dark:text-white'],
      h2: ['mt-6', 'mb-2', 'text-2xl', 'font-bold', 'text-gray-600', 'dark:text-gray-300'],
      h3: ['mt-6', 'mb-2', 'text-xl', 'font-bold', 'uppercase', 'text-gray-600', 'dark:text-gray-300'],
      p: ['mt-2', 'px-4', 'py-2', 'text-gray-800', 'dark:text-gray-200'],
      a: ['text-aruna-800', 'hover:text-aruna-700', 'dark:text-aruna-700', 'dark:hover:text-aruna-600'],
      hr: ['border-gray-400'],
      ul: ['list-disc', 'list-outside', 'space-y-5', 'ps-4', 'py-2', 'text-lg', 'text-gray-800', 'dark:text-gray-400'],
      ol: ['list-decimal', 'list-outside', 'space-y-5', 'ps-5', 'text-lg', 'text-gray-800', 'dark:text-gray-400'],
      li: ['ps-2'],
      img: ['rounded-md'],
      code: ['p-4'],
      dl: ['p-4'],
      dt: ['pt-4', 'font-medium', 'leading-6', 'text-gray-900'],
      dd: ['mt-1', 'ps-4', 'leading-6', 'text-gray-700', 'sm:col-span-2', 'sm:mt-0']
    },
    public: {
      websiteHost: 'http://localhost:3000',
      infoBanner: {
        active: false,
        title: 'Info banner title: ',
        text: 'Info banner custom text with important information ',
        link:  '/news'
      }
    }
  },
})

