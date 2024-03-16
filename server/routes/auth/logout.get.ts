export default defineEventHandler(async event => {
    setCookie(event, 'access_token', "")
    setCookie(event, 'refresh_token', "")
  return sendRedirect(event, "/" )
})