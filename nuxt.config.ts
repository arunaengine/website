// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  app: {
    head: {
      title: 'Aruna',
    }
  },
  devtools: { enabled: true },
  experimental: {
    clientNodeCompat: true
  },
  plugins: [
    "~/plugins/preline.client.ts",
  ],
  modules: ['@nuxtjs/tailwindcss', "shadcn-nuxt"],
  css: [
    '~/assets/styles/main.css',
  ],
  tailwindcss: {
    cssPath: ['~/assets/styles/main.css', {injectPosition: "first"}],
    configPath: 'tailwind.config',
  },
  shadcn: {
    prefix: '',
    componentDir: './components/ui'
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
        issuer: "http://localhost:1998",
        redirectUrl: "http://localhost:3000/callback",
        authUrl: 'http://localhost:1998/realms/test/protocol/openid-connect/auth',
        tokenUrl: 'http://localhost:1998/realms/test/protocol/openid-connect/token',
        revokeUrl: 'http://localhost:1998/realms/test/protocol/openid-connect/revoke',
        scope: ["openid"],
        code_challenge: false
      }
    },
    markdownCss: {
      h1: ['text-3xl', 'font-bold', 'text-center', 'text-aruna-text-accent'],
      h2: ['mt-6', 'mb-2', 'text-2xl', 'font-bold', 'text-aruna-text-accent'],
      h3: ['mt-6', 'mb-2', 'text-xl', 'font-bold', 'uppercase', 'text-aruna-text-accent'],
      p: ['mt-2', 'px-4', 'py-2', 'text-aruna-text'],
      a: ['text-aruna-highlight', 'hover:text-aruna-highlight/80'],
      hr: ['border-aruna-text/50'],
      ul: ['list-disc', 'list-outside', 'space-y-5', 'ps-4', 'py-2', 'text-lg', 'text-aruna-text'],
      ol: ['list-decimal', 'list-outside', 'space-y-5', 'ps-5', 'text-lg', 'text-aruna-text'],
      li: ['ps-2'],
      img: ['rounded-md'],
      code: ['p-4'],
      dl: ['p-4'],
      dt: ['pt-4', 'font-medium', 'leading-6', 'text-aruna-text-accent'],
      dd: ['mt-1', 'ps-4', 'leading-6', 'text-aruna-text', 'sm:col-span-2', 'sm:mt-0']
    },
    public: {
      maintenanceMode: false,
      websiteHost: 'http://localhost:3000',
      infoBanner: {
        active: false,
        title: 'Info banner title: ',
        text: 'Info banner custom text with important information ',
        link:  '/news'
      }
    }
  },

  compatibilityDate: '2024-11-08',
})