// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  app: {
    head: {
      title: 'Aruna',
      link: [
        {rel: 'preconnect', href: 'https://fonts.googleapis.com'},
        {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: ''},
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
        },
      ],
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
  // shadcn-nuxt registers the named exports; do not scan the index files as components
  ignore: ['components/ui/**/index.ts'],
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
        wellKnownUrl: "http://localhost:1998/realms/test/.well-known/openid-configuration",
        clientId: "test",
        clientSecret: "QgBl9I2CD3eVhL7LFvkHrYUK7oKL3LE2",
        redirectUrl: "http://localhost:3000/callback",
        scope: ["openid"],
        code_challenge: false,
        post_auth: false
      },
      gfbio: {
        wellKnownUrl: "",
        clientId: '',
        clientSecret: '',
        redirectUrl: '',
        scope: [''],
        code_challenge: false,
        post_auth: false
      },
      lifescience: {
        wellKnownUrl: "",
        clientId: '',
        clientSecret: '',
        redirectUrl: '',
        scope: [''],
        code_challenge: false,
        post_auth: false
      },
      iam4nfdi: {
        wellKnownUrl: "",
        clientId: '',
        clientSecret: '',
        redirectUrl: '',
        scope: [''],
        code_challenge: false,
        post_auth: false
      }
    },
    markdownCss: {
      h1: ['font-display', 'text-3xl', 'font-semibold', 'tracking-tight', 'text-aruna-text-accent'],
      h2: ['mt-8', 'mb-2', 'font-display', 'text-2xl', 'font-semibold', 'tracking-tight', 'text-aruna-text-accent'],
      h3: ['mt-6', 'mb-2', 'font-display', 'text-xl', 'font-semibold', 'text-aruna-text-accent'],
      p: ['mt-2', 'py-2', 'leading-relaxed', 'text-aruna-text'],
      a: ['text-aruna-tagline', 'underline-offset-4', 'hover:underline'],
      hr: ['border-aruna-text/50'],
      ul: ['list-disc', 'list-outside', 'space-y-3', 'ps-5', 'py-2', 'text-aruna-text'],
      ol: ['list-decimal', 'list-outside', 'space-y-3', 'ps-5', 'py-2', 'text-aruna-text'],
      li: ['ps-1', 'leading-relaxed'],
      img: ['rounded-lg'],
      strong: ['font-semibold', 'text-aruna-text-accent'],
      code: ['p-4'],
      dl: ['p-4'],
      dt: ['pt-4', 'font-medium', 'leading-6', 'text-aruna-text-accent'],
      dd: ['mt-1', 'ps-4', 'leading-6', 'text-aruna-text', 'sm:col-span-2', 'sm:mt-0'],
      table: ['my-6', 'w-full', 'text-sm', 'border-collapse'],
      th: ['border-b', 'border-border', 'py-2', 'pe-4', 'text-left', 'font-semibold', 'text-aruna-text-accent'],
      td: ['border-b', 'border-border', 'py-2', 'pe-4', 'align-top', 'text-aruna-text']
    },
    public: {
      maintenanceMode: false,
      websiteHost: 'http://localhost:3000',
      infoBanner: {
        active: false,
        type: 'info', // ['info', 'release', 'maintenance', 'downtime', 'error']
        title: 'Banner Title',
        text: 'Info banner custom text with important <a href="/news" class="text-aruna-highlight hover:text-aruna-highlight/80">information<a/>',
        customImg: '', // URL to external or internal image
        validFrom: '', // Some valid date string
        validTo: '', // Some valid date string
      },
      filterTestResources: false
    }
  },

  compatibilityDate: '2024-11-08',
})