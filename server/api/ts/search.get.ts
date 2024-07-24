export default defineEventHandler(async event => {
  const queryParams = getQuery(event)

  return await $fetch('https://service.tib.eu/ts4tib/api/search', {
    query: queryParams ? queryParams : {}
  })
      .then(response => {
        console.log(response)
        return response.response
      }).catch(error => {
        console.error('[Terminology Service Error]', error)
        return undefined
      })
})