<script setup lang="ts">
import type {v2User} from "./composables/aruna_api_json";
import EventBus from "~/composables/EventBus";
import type {ArunaError} from "~/composables/ArunaError";
import {parseJwt} from "~/composables/utils";

useHead({
  title: "Aruna | The data orchestration engine",
  meta: [
    {
      name: "description",
      content:
          "Aruna is a modern data orchestration engine that enables users to connect disparate data sources, transform and enrich data, and build data pipelines in a distributed multi-cloud.",
    },
  ],
});

// Provide user object globally read-only
const fetchErrorMsg: Ref<string> = ref(''); // Can be displayed for the user
const notRegistered = ref(false)
const user: Ref<v2User | undefined> = ref(undefined)
provide('userRef', readonly(user))

// Try to fetch user
async function updateUser() {
  await $fetch<v2User | ArunaError>('/api/user')
      .then(response => {
        if (typeof response === 'undefined') {
          user.value = undefined
          fetchErrorMsg.value = 'Response is undefined. Should not be possible :/'

        } else if (response.type === 'ArunaError') {
          user.value = undefined
          //fetchErrorMsg.value = `${(response as ArunaError).code} - ${(response as ArunaError).message}`

          if ((response as ArunaError).message === 'Not registered') {
            notRegistered.value = true
          } else if ((response as ArunaError).code === 14) {
            fetchErrorMsg.value = 'Aruna server is currently unavailable.'
          }
        } else {
          user.value = response as v2User
          fetchErrorMsg.value = ''
        }
      })
      .catch(error => {
        user.value = undefined
        fetchErrorMsg.value = error.message
      })
}

// Re-fetch user on demand
EventBus.on('updateUser', () => {
  console.log("Received user refresh event")
  updateUser()
})

function clearError() {
  fetchErrorMsg.value = ''
}

async function refreshTokens() {
  const refresh_token = useCookie<string>('refresh_token')
  const access_token = useCookie<string>('access_token')

  // Check if tokens are set
  if (refresh_token.value) {
    const current_timestamp = Math.floor(Date.now() / 1000)
    const refresh_expiry = parseJwt(refresh_token.value).exp
    const refresh_expired = refresh_expiry - current_timestamp <= 0

    // Is refresh token expired?
    if (!refresh_expired) {
      const access_expiry = access_token.value ? parseJwt(access_token.value).exp : 0
      const access_expired = access_expiry - current_timestamp <= 60 // Only one minute left or less

      if (access_expired) {
        await $fetch('/auth/refresh')
      }
    }
  }
}

onBeforeMount(() => setInterval(refreshTokens, 30000))
onMounted(() => updateUser())
</script>

<template>
  <!-- Header + Navigation -->
  <!-- Main body -->
  <div
      class="flex flex-col flex-grow md:min-h-screen px-6 py-2 bg-gradient-to-b from-aruna-800/[.30] via-transparent"
  >
    <!-- Body -->
    <NuxtLoadingIndicator/>
    <NuxtPage/>
  </div>
  <NavigationSidebar/>

  <ModalRegister v-if="notRegistered"/>

  <!-- Toast -->
  <ToastError @clearError="clearError" modalId="app-error-toast" :errorMsg="fetchErrorMsg"/>
  <!-- End Toast -->
</template>
