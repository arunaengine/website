import {withQuery} from 'ufo'
import crypto from 'crypto'

export default defineEventHandler(async event => {
  const provider = getQuery(event)['provider']
  const add_idp = getQuery(event)['add_idp']

  if (!provider) {
    //panic!('No provider provided')
    throw new Error('No provider provided')
  }

  // Fetch provider specific config
  const providers = useRuntimeConfig().provider
  const config = providers[provider as keyof typeof providers]
  if (!config) {
    throw new Error(`Unknown/Unsupported identity provider: ${provider}`)
  }

  // Delete older cookie with login meta info
  deleteCookie(event, 'login_meta')

  if (config?.code_challenge) {
    //const state = crypto.randomUUID() // Optional
    const code_verifier = crypto.randomUUID()
    const code_challenge = crypto.createHash('sha256').update(code_verifier).digest().toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

    // Cache login meta information in cookie for callback
    setCookie(event, 'login_meta', JSON.stringify( {
      provider: provider,
      code_verifier: code_verifier,
      add_idp: add_idp ? add_idp : false
    }))

    // Redirect to idp authorization
    return sendRedirect(
        event,
        withQuery(config.authUrl, {
          response_type: 'code',
          client_id: config.clientId,
          redirect_uri: config.redirectUrl,
          scope: config.scope.join(' '),
          code_challenge_method: 'S256',
          code_challenge: code_challenge
        })
    )
  } else {
    // Cache login meta information in cookie for callback
    setCookie(event, 'login_meta', JSON.stringify( {
      provider: provider,
      code_verifier: undefined,
      add_idp: add_idp ? add_idp : false
    }))

    // Redirect to idp authorization without code challenge
    return sendRedirect(
        event,
        withQuery(config.authUrl, {
          client_id: config.clientId,
          redirect_uri: config.redirectUrl,
          scope: config.scope.join(' '),
          response_type: 'code',
        })
    )
  }
})