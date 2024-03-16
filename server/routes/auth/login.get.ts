import { withQuery, parsePath } from 'ufo'

export default defineEventHandler(async event => {
  const config = useRuntimeConfig().provider.local;
  const realmURL = `${config.serverUrl}/realms/${config.realm}`
  const authorizationURL = `${realmURL}/protocol/openid-connect/auth`
  const tokenURL = `${realmURL}/protocol/openid-connect/token`

  return sendRedirect(
    event,
    withQuery(authorizationURL, {
      client_id: config.clientId,
      redirect_uri: "http://localhost:3000/auth/callback",
      scope: config.scope.join(' '),
      response_type: 'code',
    })
  )
})