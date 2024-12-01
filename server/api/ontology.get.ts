import {SelectOntologyResponse} from "~/types/SelectOntologyResponse";

export default defineEventHandler(async event => {
  const queryParams = getQuery(event)
  const ontologyName = queryParams['ontologyName'] || ''
  const baseUrl = useRuntimeConfig().terminologyService.api
  const fetchUrl = `${baseUrl}/select`

  return await $fetch<SelectOntologyResponse>(fetchUrl, {
    query: {
      q: ontologyName,
      type: 'ontology',
      fieldList: 'id,ontology_name,short_form,iri,label,description'
    }
  }).then(response => {
    return response.response.docs
  }).catch(error => {
    console.error('[Ontology Select]', error)
    return []
  })
})