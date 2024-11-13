export default defineEventHandler(async event => {
  // Delete token cookies on logout
  deleteCookie(event, 'access_token')
  deleteCookie(event, 'refresh_token')
  deleteCookie(event, 'code_verifier') // Just for good measure

  // Redirect to homepage
  return sendRedirect(event, "/" )
})