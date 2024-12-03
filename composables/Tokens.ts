import EventBus from "~/composables/EventBus";
import type {CreateTokenRequest, CreateTokenResponse} from "~/composables/api_wrapper";

// by convention, composable function names start with "use"
export async function useTokens() {
  // state encapsulated and managed by the composable
  const tokens: Ref<Token[] | null> = ref(null)
  const {refresh: refreshTokens} = await useFetch<GetTokensFromUserResponse>('/api/v3/tokens', {
    server: false,
    lazy: true,
    onResponse({response}) {
      if (response) {
        console.info('[GetTokensFromUser] Fetched tokens:', response._data.tokens)
        tokens.value = response._data.tokens
        return
      }

      console.warn('[GetTokensFromUser] Response was undefined. Returning empty array.')
      tokens.value = []
    },
    onResponseError({ response }) {
      console.error('[]')
    }
  })

  // a composable can update its managed state over time.
  EventBus.on('updateTokens', async () => {
    console.log('Triggered tokens update')
    await refreshTokens()
  })

  async function createToken(request: CreateTokenRequest): Promise<CreateTokenResponse> {
    return await $fetch<CreateTokenResponse>('/api/v3/tokens', {
      method: 'POST'
    }).then(response => {
      if (response)
        tokens.value ? tokens.value.push(response.token) : tokens.value = [response.token]

      return response
    })
  }

  // expose managed state (and refresh alternative) as return value
  return {tokens, refreshTokens, createToken}
}