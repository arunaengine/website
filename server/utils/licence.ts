import {modelsv2License, v2GetLicenseResponse} from "~/composables/aruna_api_json";

export const fetchCachedLicense = defineCachedFunction(async (licenseTag: string): Promise<modelsv2License | undefined> => {
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = licenseTag ? `${baseUrl}/v2/licenses/${licenseTag}` : `${baseUrl}/v2/licenses`

  return await $fetch<v2GetLicenseResponse>(fetchUrl)
      .then(response => response.license)
      .catch(error => {
        console.error(error)
        return undefined
      })
}, {
  group: 'licenses',
  name: 'license-tag',
  maxAge: useRuntimeConfig().cacheMaxAge || 60 * 60 * 24 * 365, // Defaults to 1 year
  swr: false,
  getKey: (licenseTag: string) => licenseTag,
})
