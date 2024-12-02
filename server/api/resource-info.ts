import type {v2GetResourceResponse} from '~/composables/aruna_api_json'
import {ResourceInfo} from "~/composables/ResourceInfo";
import {fetchCachedLicense} from "~/server/utils/licence";

export default defineEventHandler(async event => {
  const access_token = getCookie(event, 'access_token') // Does not matter if undefined
  const resourceId = getQuery(event)['resourceId'] as string
  const noLicenseText = getQuery(event)['noLicenseText'] as boolean


  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/v2/resources/${resourceId}`

  return await $fetch<v2GetResourceResponse>(fetchUrl, {
    headers: access_token ? {
      'Authorization': `Bearer ${access_token}`
    } : {}
  }).then(async response => {
    const resource = response.resource?.resource
    const permission = response.resource?.permission
    let metaLicense = undefined
    let dataLicense = undefined

    if (resource && permission) {
      if (resource.project) {
        metaLicense = await fetchCachedLicense(resource.project.metadataLicenseTag || '')
        dataLicense = await fetchCachedLicense(resource.project.defaultDataLicenseTag || '')
      } else if (resource.collection) {
        metaLicense = await fetchCachedLicense(resource.collection.metadataLicenseTag || '')
        dataLicense = await fetchCachedLicense(resource.collection.defaultDataLicenseTag || '')
      } else if (resource.dataset) {
        metaLicense = await fetchCachedLicense(resource.dataset.metadataLicenseTag || '')
        dataLicense = await fetchCachedLicense(resource.dataset.defaultDataLicenseTag || '')
      } else if (resource.object) {
        metaLicense = await fetchCachedLicense(resource.object.metadataLicenseTag || '')
        dataLicense = await fetchCachedLicense(resource.object.dataLicenseTag || '')
      }

      // Create ResourceInfo object
      const info = ResourceInfo.fromParts(resource, permission, metaLicense, dataLicense)

      // Remove license text to save on response size
      if (noLicenseText)
        info.metaLicense.text = info.dataLicense.text = ''

      return {resource: info, jsonLd: info.toJsonLd()}
    }

    return undefined
  })
})