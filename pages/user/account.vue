<script setup lang="ts">
import {
  IconArrowLeft,
  IconBuildingWarehouse,
  IconCheck,
  IconPokeball,
  IconUserScan,
  IconX,
  IconTrash
} from '@tabler/icons-vue';
import type { v2Token } from '~/composables/aruna_api_json';

const router = useRouter()
const arunaUser = await fetchUser(undefined)
//const endpoints = await fetchEndpoints()


const get_user = () => {
  if (typeof arunaUser === "string") {
    return undefined
  }
  return arunaUser
}

const is_active = () => {
  if (typeof arunaUser === "string") {
    return false
  }
  if (arunaUser?.active) {
    arunaUser?.active
  }
  return false
}


function getTokens(): v2Token[] {
  if (typeof arunaUser === "string") {
    return []
  }
  if (arunaUser?.attributes?.tokens) {
    return arunaUser?.attributes?.tokens
  }
  return []
}
</script>

<template>
  <NavbarTop />

  <div class="flex flex-wrap justify-between container mx-auto my-10">
    <h1 class="text-3xl font-bold text-gray-700 dark:text-white">
      Hej {{ get_user()?.displayName }},
    </h1>
    <button @click="router.back()"
      class="cursor-pointer px-4 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-gray-700 hover:bg-gray-300 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/30 dark:hover:text-gray-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
      <IconArrowLeft class="icon" />
    </button>
  </div>

  <div
    class="md:container sm:mx-1 md:mx-auto mt-4 p-4 border border-gray-300 rounded-lg bg-white/[.5] dark:bg-white/[.75]">
    <div class="border-b border-gray-300 dark:border-gray-700">
      <nav class="flex space-x-6" aria-label="Tabs" role="tablist">
        <button type="button"
          class="hs-tab-active:font-semibold hs-tab-active:border-aruna-800 hs-tab-active:text-aruna-800 py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-lg whitespace-nowrap text-gray-500 hover:text-blue-600 focus:outline-none focus:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-500 active"
          id="tabs-with-icons-item-1" data-hs-tab="#tabs-with-icons-1" aria-controls="tabs-with-icons-1" role="tab">
          <IconUserScan class="flex-shrink-0" />
          Profile
        </button>
        <button type="button" :disabled="!is_active()"
          class="hs-tab-active:font-semibold hs-tab-active:border-aruna-800 hs-tab-active:text-aruna-800 py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-lg whitespace-nowrap text-gray-500 hover:text-blue-600 focus:outline-none focus:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-500"
          id="tabs-with-icons-item-2" data-hs-tab="#tabs-with-icons-2" aria-controls="tabs-with-icons-2" role="tab">
          <IconPokeball class="flex-shrink-0 size-4"/>
          Tokens
        </button>
        <button type="button" :disabled="!is_active()"
          class="hs-tab-active:font-semibold hs-tab-active:border-aruna-800 hs-tab-active:text-aruna-800 py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-lg whitespace-nowrap text-gray-500 hover:text-blue-600 focus:outline-none focus:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-500"
          id="tabs-with-icons-item-3" data-hs-tab="#tabs-with-icons-3" aria-controls="tabs-with-icons-3" role="tab">
          <IconBuildingWarehouse class="flex-shrink-0 size-4" />
          Data Proxies
        </button>
      </nav>
    </div>

    <div class="mt-3">
      <div id="tabs-with-icons-1" role="tabpanel" aria-labelledby="tabs-with-icons-item-1">
        <div class="bg-yellow-100 border border-yellow-200 text-sm text-yellow-800 rounded-lg p-4 dark:bg-yellow-800/10 dark:border-yellow-900 dark:text-yellow-500" role="alert" v-if="!is_active()">
          <span class="font-bold">Info: </span> Your account is currently not active. We will activate your account as soon as possible.
        </div>
        <div class="flex flex-auto gap-4">
          
          <div
            class="flex flex-auto flex-col bg-transparent text-center dark:bg-slate-900 dark:border-gray-700 dark:shadow-slate-700/[.7]">
            <h3 class="text-lg font-bold text-gray-600 dark:text-white">
              ID
            </h3>
            <p class="mt-2 text-gray-500 dark:text-gray-400">
              {{ get_user()?.id }}
            </p>
          </div>

          <div
            class="flex flex-auto flex-col text-center dark:bg-slate-900 dark:border-gray-700 dark:shadow-slate-700/[.7]">
            <h3 class="text-lg font-bold text-gray-600 dark:text-white">
              Display Name
            </h3>
            <p class="mt-2 text-gray-500 dark:text-gray-400">
              {{ get_user()?.displayName }}
            </p>
          </div>

          <div class="flex flex-auto flex-col text-center  dark:border-gray-700 dark:shadow-slate-700/[.7]">
            <h3 class="text-lg font-bold text-gray-800 dark:text-white">
              Email
            </h3>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
              {{ get_user()?.email ? get_user()?.email : "No email provided" }}
            </p>
          </div>

          <div
            class="flex flex-auto flex-col text-center dark:bg-slate-900 dark:border-gray-700 dark:shadow-slate-700/[.7]">
            <h3 class="text-lg font-bold text-gray-600 dark:text-white">
              Is active:
            </h3>
            <p class="flex grow-0 items-center justify-center mt-2 text-gray-500 dark:text-gray-400">
              <IconCheck v-if="get_user()?.active" class="mx-2 flex-shrink-0 text-green-600" />
              <IconX v-else class="icon text-red" />
            </p>
          </div>
        </div>

      </div>
      <div id="tabs-with-icons-2" class="hidden" role="tabpanel" aria-labelledby="tabs-with-icons-item-2">
        <div class="flex flex-col">
          <div class="-m-1.5 overflow-x-auto">
            <div class="p-1.5 min-w-full inline-block align-middle">
              <div class="overflow-hidden">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr>
                      <th scope="col" class="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">ID</th>
                      <th scope="col" class="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th scope="col" class="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">Last Used
                      </th>
                      <th scope="col" class="px-6 py-3 text-end text-xs font-medium text-gray-500 uppercase">Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody v-if="getTokens().length > 0" class="divide-y divide-gray-200 dark:divide-gray-700">
                    <tr v-for="token in getTokens()" class="hover:bg-gray-100 dark:hover:bg-gray-700">
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800 dark:text-gray-200">
                        {{ token.id }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                        {{ token.name }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                        Not yet implemented
                      </td>

                      <td class="px-6 py-4 whitespace-nowrap text-end text-sm font-medium">
                        <button type="button"
                          class="inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-500 dark:hover:text-gray-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
                          <IconTrash />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                  <tbody v-else>
                    <tr class="hover:bg-gray-100 dark:hover:bg-gray-700">
                      <td colspan="4" class="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                        <strong>Looks like you currently have no active tokens!</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-row justify-end">
          <button type="button"
            class="py-3 px-4 inline-flex gap-x-2 text-md font-semibold rounded-lg bg-aruna-800 border border-gray-200 text-slate-300 hover:border-aruna-800 hover:text-aruna-800 disabled:opacity-50 disabled:pointer-events-none dark:border-gray-700 dark:text-gray-400 dark:hover:text-blue-500 dark:hover:border-blue-600 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            data-hs-overlay="#token-create-modal">
            Create token
          </button>
        </div>
      </div>

      <div id="tabs-with-icons-3" class="hidden" role="tabpanel" aria-labelledby="tabs-with-icons-item-3">
        
        <div class="flex flex-auto flex-wrap gap-x-4 text-gray-600">
          <div v-for="endpoint in endpoints"
            class="flex flex-col space-y-1 bg-white border border-gray-200 shadow-sm rounded-xl p-4 md:p-5 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
            <div class="flex flex-row font-bold text-aruna-800 dark:text-aruna-700">
              {{ endpoint.id }}
            </div>
            <div class="flex flex-row">
              <span class="font-bold me-2 text-gray-700 dark:text-gray-500">Name:</span> 
              {{ endpoint.name }}
            </div>
            <div class="flex flex-row">
              <span class="font-bold me-2 text-gray-700 dark:text-gray-500">Variant:</span> 
              {{ toEndpointVariantStr(endpoint.epVariant) }}
            </div>
            <div class="flex flex-row">
              <span class="font-bold me-2 text-gray-700 dark:text-gray-500">Public:</span> 
              {{ endpoint.isPublic }}
            </div>
            <div class="flex flex-row">
              <span class="font-bold me-2 text-gray-700 dark:text-gray-500">Status:</span> 
              {{ toComponentStatusStr(endpoint.status) }}
            </div>
            <div class="flex flex-row justify-end">
              <IconRosette v-if="hasEndpoint(endpoint.id)" />
              <button type="button"
                class="py-1 px-2 mt-2 inline-flex gap-x-2 text-md rounded-lg bg-aruna-800 border border-gray-200 text-slate-100 hover:border-aruna-800 hover:text-aruna-800 disabled:opacity-50 disabled:pointer-events-none dark:border-gray-700 dark:text-gray-400 dark:hover:text-blue-500 dark:hover:border-blue-600 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                data-hs-overlay="#get-s3-modal">
                Get S3 Credentials
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <Footer />

  <!-- Hidden modal dialogs -->
  <ModalToken modalId="token-create-modal" />
  <ModalS3credentials modal-id="get-s3-modal" />
</template>