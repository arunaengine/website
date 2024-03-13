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
import type {v2Token} from '~/composables/aruna_api_json';

// Redirect to log in if not logged in
definePageMeta({
  middleware: "check-access"
})

const router = useRouter()
const arunaUser = await fetchUser()

function getTokens(): v2Token[] {
  if (arunaUser?.attributes?.tokens) {
    return arunaUser?.attributes?.tokens
  }
  return []
}
</script>

<template>
  <NavbarTop/>

  <div class="flex flex-wrap justify-between container mx-auto mt-10">
    <h1 class="text-3xl font-bold text-gray-700 dark:text-white">
      Overview User
    </h1>
    <button @click="router.back()"
            class="cursor-pointer px-4 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-blue-600 hover:bg-blue-100 hover:text-blue-800 disabled:opacity-50 disabled:pointer-events-none dark:text-blue-500 dark:hover:bg-blue-800/30 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
      <IconArrowLeft class="icon"/>
    </button>
  </div>

  <div class="md:container sm:mx-1 md:mx-auto mt-4 p-4 border rounded-lg bg-white">
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-2" aria-label="Tabs" role="tablist">
        <button type="button"
                class="hs-tab-active:font-semibold hs-tab-active:border-blue-600 hs-tab-active:text-blue-600 py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-sm whitespace-nowrap text-gray-500 hover:text-blue-600 focus:outline-none focus:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-500 active"
                id="tabs-with-icons-item-1" data-hs-tab="#tabs-with-icons-1" aria-controls="tabs-with-icons-1"
                role="tab">
          <IconUserScan class="flex-shrink-0 size-4"/>
          Profile
        </button>
        <button type="button"
                class="hs-tab-active:font-semibold hs-tab-active:border-blue-600 hs-tab-active:text-blue-600 py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-sm whitespace-nowrap text-gray-500 hover:text-blue-600 focus:outline-none focus:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-500"
                id="tabs-with-icons-item-2" data-hs-tab="#tabs-with-icons-2" aria-controls="tabs-with-icons-2"
                role="tab">
          <IconPokeball class="flex-shrink-0 size-4"/>
          Tokens
        </button>
        <button type="button"
                class="hs-tab-active:font-semibold hs-tab-active:border-blue-600 hs-tab-active:text-blue-600 py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-sm whitespace-nowrap text-gray-500 hover:text-blue-600 focus:outline-none focus:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-500"
                id="tabs-with-icons-item-3" data-hs-tab="#tabs-with-icons-3" aria-controls="tabs-with-icons-3"
                role="tab">
          <IconBuildingWarehouse class="flex-shrink-0 size-4"/>
          Data Proxies
        </button>
      </nav>
    </div>

    <div class="mt-3">
      <div id="tabs-with-icons-1" role="tabpanel" aria-labelledby="tabs-with-icons-item-1">
        <div class="flex flex-auto gap-4">
          <div
              class="flex flex-auto flex-col bg-transparent text-center dark:bg-slate-900 dark:border-gray-700 dark:shadow-slate-700/[.7]">
            <h3 class="text-lg font-bold text-gray-600 dark:text-white">
              ID
            </h3>
            <p class="mt-2 text-gray-500 dark:text-gray-400">
              {{ arunaUser?.id }}
            </p>
          </div>

          <div
              class="flex flex-auto flex-col bg-white text-center dark:bg-slate-900 dark:border-gray-700 dark:shadow-slate-700/[.7]">
            <h3 class="text-lg font-bold text-gray-600 dark:text-white">
              Display Name
            </h3>
            <p class="mt-2 text-gray-500 dark:text-gray-400">
              {{ arunaUser?.displayName }}
            </p>
          </div>

          <div
              class="flex flex-auto flex-col bg-white text-center dark:bg-slate-900 dark:border-gray-700 dark:shadow-slate-700/[.7]">
            <h3 class="text-lg font-bold text-gray-800 dark:text-white">
              Email
            </h3>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
              {{ arunaUser?.email ? arunaUser?.email : "No email provided" }}
            </p>
          </div>

          <div
              class="flex flex-auto flex-col bg-white text-center dark:bg-slate-900 dark:border-gray-700 dark:shadow-slate-700/[.7]">
            <h3 class="text-lg font-bold text-gray-600 dark:text-white">
              Is active:
            </h3>
            <p class="flex grow-0 items-center justify-center mt-2 text-gray-500 dark:text-gray-400">
              <IconCheck v-if="arunaUser?.active" class="mx-2 flex-shrink-0 text-green-600"/>
              <IconX v-else class="icon text-red"/>
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
                    <th scope="col" class="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">Last Used</th>
                    <th scope="col" class="px-6 py-3 text-end text-xs font-medium text-gray-500 uppercase">Actions</th>
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
                              class="inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:pointer-events-none dark:text-blue-500 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
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
                  class="py-3 px-4 inline-flex gap-x-2 text-sm font-semibold rounded-lg border border-gray-200 text-gray-500 hover:border-arunaPrimary hover:text-arunaPrimary disabled:opacity-50 disabled:pointer-events-none dark:border-gray-700 dark:text-gray-400 dark:hover:text-blue-500 dark:hover:border-blue-600 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                  data-hs-overlay="#token-create-modal">
            Create token
          </button>
        </div>
      </div>

      <div id="tabs-with-icons-3" class="hidden" role="tabpanel" aria-labelledby="tabs-with-icons-item-3">
        <p class="text-gray-500 dark:text-gray-400">
          This is the <em class="font-semibold text-gray-800 dark:text-gray-200">third</em> item's tab body.
        </p>
      </div>
    </div>
  </div>

  <ModalToken modalId="token-create-modal" />

  <!-- Token List
  <div class="container-xl mt-2 text-start">
    <div class="card">
      <div class="table-responsive">
        <table class="table table-vcenter card-table accordion" id="tokenTable">
          <thead>
          <tr>
            <th>Id</th>
            <th>Name</th>
            <th>Last used</th>
            <th class="w-3 text-end">Actions</th>
          </tr>
          </thead>
          <tbody>
          <tr v-if="getTokens().length > 0" v-for="token in getTokens()">
            <td>{{ token.id }}</td>
            <td>{{ token.name }}</td>
            <td>Not yet implemented</td>
            <td>
              Details & Delete
            </td>
          </tr>
          <tr v-else>
            <td colspan="4" class="text-center">
              Looks like you currently have no active tokens!
            </td>
          </tr>
          </tbody>
        </table>
      </div>
      <div class="card-footer p-0">
        <div class="d-flex">
          <button @click="" class="btn btn-primary ms-auto m-1">
            <IconPlus class="icon"/>
            Create Token
          </button>
        </div>
      </div>
    </div>
  </div>
  -->
</template>