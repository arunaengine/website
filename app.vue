<script setup lang="ts">
import {IconPlant} from "@tabler/icons-vue";
import type {v2User} from "./composables/aruna_api_json";
import EventBus from "~/composables/EventBus";
import type {ArunaError} from "~/composables/ArunaError";
import {parseJwt} from "~/composables/utils";

import {h} from 'vue';
import Toaster from '@/components/ui/toast/Toaster.vue'
import RegistrationDialog from "~/components/custom-ui/dialog/RegistrationDialog.vue";
import {useToast} from '@/components/ui/toast/use-toast'

const {toast} = useToast()

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
const notRegistered = ref(false)
const user: Ref<v2User | undefined> = ref(undefined)
provide('userRef', readonly(user))

// Try to fetch user
async function updateUser() {
  // Only fetch user if not in maintenance mode
  if (useRuntimeConfig().public.maintenanceMode)
    return

  await $fetch<v2User | ArunaError>('/api/user')
      .then(response => {
        if (typeof response === 'undefined') {
          user.value = undefined
          toast({
            title: 'Error',
            //description: 'Something went wrong. If this problem persists please contact an administrator.',
            description: 'User fetch response is undefined. This should not be possible :/',
            variant: 'destructive',
            duration: 10000,
          })
        } else if (response.type === 'ArunaError') {
          user.value = undefined
          if ((response as ArunaError).message === 'Not registered') {
            notRegistered.value = true
          } else if ((response as ArunaError).code === 13) {
            // gRPC code 13 = Internal
            notRegistered.value = false
            console.error(`${(response as ArunaError).code} - ${(response as ArunaError).message}`)
          } else if ((response as ArunaError).code === 14) {
            // gRPC code 14 = Unavailable
            notRegistered.value = false
            toast({
              title: 'Error',
              description: 'Aruna server is currently unavailable.',
              variant: 'destructive',
              duration: 10000,
            })
          } else if ((response as ArunaError).code === 16) {
            // gRPC code 16 = Unauthorized
            notRegistered.value = false
          } else {
            // Nuxt server-side error
            notRegistered.value = false
            console.error((response as ArunaError).message)
          }
        } else {
          notRegistered.value = false
          user.value = response as v2User

          if (!user.value.active)
            toast({
              description: h('div',
                  {class: 'flex space-x-2 items-center justify-center'},
                  [
                    h(IconPlant, {class: 'flex-shrink-0 size-5 text-green-400'}),
                    h('span',
                        {class: 'text-fuchsia-50'},
                        ['Please wait until your account gets activated by an administrator.'])
                  ]),
              duration: 10000
            })
        }
      }).catch(() => {
        user.value = undefined
        notRegistered.value = false
        toast({
          title: 'Error',
          description: 'Something unexpected went wrong. If this problem persists please contact an administrator.',
          variant: 'destructive',
          duration: 10000,
        })
      })
}

// Re-fetch user on demand
EventBus.on('updateUser', () => {
  console.log("Received user refresh event")
  updateUser()
})

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
onBeforeMount(() => updateUser())
</script>

<template>
  <RegistrationDialog @closeRegisterDialog="notRegistered=false" :withButton="false" :initialOpen="notRegistered"/>

  <!-- Header + Navigation -->
  <!-- Main body -->
  <div v-if="useRuntimeConfig().public.maintenanceMode"
       class="h-[100vh] w-[100vw] bg-[url('/public/imgs/maintenance_sm.webp')] md:bg-[url('/public/imgs/maintenance_md.webp')] lg:bg-[url('/public/imgs/maintenance_lg.webp')] bg-no-repeat bg-center bg-cover to-transparent">
  </div>

  <div v-else
       class="flex flex-col flex-grow md:min-h-screen ">

    <ToastInfo v-if="useRuntimeConfig().public.infoBanner.active" modalId="info-toast" infoMsg="Hello"/>
    <NuxtLoadingIndicator/>
    <NuxtPage/>
  </div>
  <NavigationSidebar/>
  
  <Toaster/>
</template>
