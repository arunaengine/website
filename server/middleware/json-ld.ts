
export default defineEventHandler(async (event) => {
  if (event.headers.has('Content-Type') && event.headers.get('Content-Type') === 'application/ld+json') {
    const PATH_REGEX: RegExp = new RegExp('^/objects/(?<ulid>[0-7][0-9A-HJKMNP-TV-Z]{25})$')
    const result = PATH_REGEX.exec(event.path)
    const resourceId = result?.groups ? result?.groups['ulid'] : undefined

    if (resourceId) {
      setResponseHeaders(event, {
        'Content-Type': 'application/ld+json'
      })
      return await $fetch(`/api/object/${resourceId}/json-ld`)
    }
  }
})