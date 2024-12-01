<script setup lang="ts">
import EventBus from "~/composables/EventBus";
import {parseJwt} from "~/composables/utils";
import {useUser} from '~/composables/User'

import Toaster from '~/components/ui/toast/Toaster.vue'
import RegistrationDialog from "~/components/custom-ui/dialog/RegistrationDialog.vue";
import Banner from "~/components/custom-ui/Banner.vue";
import {addSeconds} from "date-fns";

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

// App wide info banner
const bannerConf = useRuntimeConfig().public.infoBanner
const bannerCookie: Ref<string | undefined> = useCookie('banner', {sameSite: true})
const bannerVisible = computed(() => {
  // Configuration dependent actions
  if (bannerConf.active) {
    const currentTimestamp = Date.now()
    const validFrom = Date.parse(bannerConf.validFrom) || 0
    const validTo = Date.parse(bannerConf.validTo) || Number.MAX_SAFE_INTEGER

    // Check if in specified time range
    if ((currentTimestamp - validFrom) * (currentTimestamp - validTo) <= 0) {
      // Check if cookie is already present
      if (bannerCookie.value) {
        const cookieDate = Date.parse(bannerCookie.value)
        // Check if cookie value is valid date string
        if (!isNaN(cookieDate))
          return currentTimestamp > cookieDate
        else
          bannerCookie.value = undefined // Safe to delete cookie if value is not a valid date string
      }
      return true
    } else {
      // Delete cookie if banner is not active
      bannerCookie.value = undefined
      return false
    }
  }
  return false
})

function hideBanner() {
  bannerCookie.value = addSeconds(new Date(), bannerConf.hidePeriod).toISOString()
}

// Provide user object globally read-only
const {user, unregistered, refreshUser} = await useUser(useRuntimeConfig().public.maintenanceMode)
provide('userRef', readonly(user))

// Re-fetch user on demand
EventBus.on('updateUser', async () => {
  console.log("Received user refresh event")
  await refreshUser() //updateUser()
})

// Auto-refresh access/refresh token before expiry
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
</script>

<template>
  <RegistrationDialog @closeRegisterDialog="refreshUser()" :withButton="false" :initialOpen="unregistered"/>

  <!-- Main body -->
  <div v-if="useRuntimeConfig().public.maintenanceMode"
       class="h-[100vh] w-[100vw] bg-no-repeat bg-center bg-cover to-transparent
              bg-[url('/imgs/maintenance_sm.webp')]
              md:bg-[url('/imgs/maintenance_md.webp')]
              lg:bg-[url('/imgs/maintenance_lg.webp')]">
  </div>

  <div v-else
       class="flex flex-col flex-grow md:min-h-screen ">

    <Banner v-if="bannerVisible"
            @hide-banner="hideBanner"
            :type="bannerConf.type"
            :title="bannerConf.title"
            :text="bannerConf.text"
            :custom-img="bannerConf.customImg"/>
    <NuxtLoadingIndicator/>
    <NuxtPage/>
  </div>
  <!-- End Main body -->

  <Toaster/>
</template>
