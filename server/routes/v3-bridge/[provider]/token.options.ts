import {portalCors} from "~/server/utils/oidc";

// CORS preflight of the portal token request
export default defineEventHandler(event => {
  portalCors(event)
  return sendNoContent(event, 204)
})
