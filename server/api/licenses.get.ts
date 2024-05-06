
import type { v2ListLicensesResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/licenses`
    const response = await $fetch<v2ListLicensesResponse>(fetchUrl)

    return response.licenses
})