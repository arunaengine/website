import * as h3 from 'h3'

// Runs the real server routes on h3 with stubbed Nitro globals and no network.
export const config: any = {
  cacheMaxAge: 60,
  provider: {
    local: {
      wellKnownUrl: 'https://local.test/.well-known/openid-configuration',
      clientId: 'local-client',
      clientSecret: 'local-secret',
      redirectUrl: 'https://web.test/callback',
      scope: ['openid'],
      code_challenge: false,
      post_auth: false,
    },
    lifescience: {
      wellKnownUrl: 'https://lifescience.test/.well-known/openid-configuration',
      clientId: 'ls-client',
      clientSecret: 'ls-secret',
      redirectUrl: 'https://web.test/callback',
      scope: ['openid'],
      code_challenge: true,
      post_auth: false,
    },
    iam4nfdi: {
      wellKnownUrl: 'https://iam4nfdi.test/.well-known/openid-configuration',
      clientId: 'aruna-engine.org/callback',
      clientSecret: 'nfdi-secret',
      redirectUrl: 'https://web.test/callback',
      scope: ['openid'],
      code_challenge: false,
      post_auth: true,
    },
  },
  v3Bridge: {realmUrl: 'https://kc.test/realms/aruna', providers: 'lifescience,iam4nfdi,gfbio'},
}

export const fetchCalls: { url: string, options: any }[] = []
let fetchReply: (url: string, options: any) => unknown = () => undefined

export function replyWith(reply: (url: string, options: any) => unknown) {
  fetchCalls.length = 0
  fetchReply = reply
}

export function idpMetadata(url: string) {
  const host = new URL(url).origin
  return {
    issuer: host,
    authorization_endpoint: `${host}/authorize`,
    token_endpoint: `${host}/token`,
    userinfo_endpoint: `${host}/userinfo`,
    jwks_uri: `${host}/jwks`,
  }
}

Object.assign(globalThis, h3, {
  useRuntimeConfig: () => config,
  defineCachedFunction: (fn: any) => fn,
  $fetch: async (url: string, options: any) => {
    fetchCalls.push({url, options})
    return fetchReply(url, options)
  },
  fetch: async (url: string, options: any) => {
    fetchCalls.push({url, options})
    const reply = fetchReply(url, options)
    return reply instanceof Response ? reply : Response.json(reply)
  },
})

export async function createHandler() {
  const route = async (path: string) => (await import(`../server/routes/${path}`)).default
  const router = h3.createRouter()
    .get('/auth/login', await route('auth/login.get.ts'))
    .get('/callback', await route('callback.get.ts'))
    .get('/v3-bridge/:provider/authorize', await route('v3-bridge/[provider]/authorize.get.ts'))
    .post('/v3-bridge/:provider/token', await route('v3-bridge/[provider]/token.post.ts'))
    .options('/v3-bridge/:provider/token', await route('v3-bridge/[provider]/token.options.ts'))
    .get('/v3-bridge/:provider/.well-known/openid-configuration', await route('v3-bridge/[provider]/.well-known/openid-configuration.get.ts'))
  return h3.toWebHandler(h3.createApp().use(router))
}

export function cookieValue(response: Response, name: string): string | undefined {
  const cookie = response.headers.getSetCookie().find(c => c.startsWith(`${name}=`))
  return cookie?.split(';')[0].slice(name.length + 1)
}
