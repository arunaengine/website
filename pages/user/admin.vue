<script setup lang="ts">
import { IconArrowLeft } from '@tabler/icons-vue'
import { IconCheck, IconMinus, IconPlus, IconSearch, IconX } from '@tabler/icons-vue'
import type { v2User } from '~/composables/aruna_api_json'

const router = useRouter()
const users: Ref<v2User[] | undefined> = ref(undefined)
const forceRefresh = ref(0)

async function fillUsers() {
  users.value = await fetchUsers()
  forceRefresh.value += 1
}

async function deactivate(userId: string) {
  await deactivateUser(userId)
  await fillUsers()
}

async function activate(userId: string) {
  await activateUser(userId)
  await fillUsers()
}

onMounted(async () => await fillUsers())
</script>

<template>
  <NavigationTop />

  <div class="flex flex-wrap justify-between container mx-auto my-10">
    <h1 class="text-3xl font-bold text-gray-700 dark:text-white">
      User Administration
    </h1>
    <button @click="router.back()"
      class="cursor-pointer px-4 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-gray-700 hover:bg-gray-300 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/30 dark:hover:text-gray-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
      <IconArrowLeft class="icon" />
    </button>
  </div>

  <div class="md:container sm:mx-1 md:mx-auto mt-4 p-4 border border-gray-500 rounded-lg ">
    <div class="flex flex-col">
      <div class="-m-1.5 overflow-x-auto">
        <div class="p-1.5 min-w-full inline-block align-middle">
          <div class="overflow-hidden">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th scope="col" class="px-6 py-3 text-start text-md font-medium text-gray-500 uppercase">ID</th>
                  <th scope="col" class="px-6 py-3 text-start text-md font-medium text-gray-500 uppercase">Name</th>
                  <th scope="col" class="px-6 py-3 text-start text-md font-medium text-gray-500 uppercase">Email
                  </th>
                  <th scope="col" class="px-6 py-3 text-center text-md font-medium text-gray-500 uppercase">Status
                  </th>
                  <th scope="col" class="px-6 py-3 text-center text-md font-medium text-gray-500 uppercase">Actions
                  </th>
                </tr>
              </thead>

              <tbody v-if="users" class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr :key="forceRefresh" v-for="user in users" class="hover:bg-gray-100 dark:hover:bg-gray-700">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800 dark:text-gray-200">
                    {{ user.id }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                    {{ user.displayName }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                    {{ user.email ? user.email : "No email provided" }}
                  </td>
                  <td
                    class="flex justify-center space-x-2 px-6 py-4 whitespace-nowrap text-center content-center text-sm text-gray-800 dark:text-gray-200">
                    <span v-if="user.attributes?.globalAdmin"
                      class="inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-full text-xs font-medium bg-red-200 text-red-800 dark:bg-red-800/30 dark:text-red-500">
                      Admin
                    </span>
                    <span v-else
                      class="inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-full text-xs font-medium bg-blue-200 text-blue-800 dark:bg-blue-800/30 dark:text-blue-500">
                      User
                    </span>

                    <span v-if="user.active"
                      class="py-1.5 px-3 inline-flex items-center gap-x-1 text-xs font-medium rounded-full bg-teal-100 text-teal-800 dark:bg-teal-500/10 dark:text-teal-500">
                      <IconCheck class="flex-shrink-0 size-4" />
                      Active
                    </span>
                    <span v-else
                      class="py-1 px-1.5 inline-flex items-center gap-x-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-500/10 dark:text-red-500">
                      <IconX class="flex-shrink-0 size-3" />
                      Disabled
                    </span>
                  </td>

                  <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                    <button type="button"
                      class="inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border p-1 me-2 border-slate-300 text-gray-700 hover:text-gray-600 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
                      <IconSearch />
                    </button>
                    <div v-if="user.active && user.id" class="hs-tooltip inline-block">
                      <button
                        class="inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border p-1 me-2 border-slate-300 text-gray-700 hover:text-gray-600 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                        @click="deactivate(user.id)">
                        <IconMinus class="flex-shrink-0" />
                        <span
                          class="hs-tooltip-content hs-tooltip-shown:opacity-100 hs-tooltip-shown:visible opacity-0 transition-opacity inline-block absolute invisible z-10 py-1 px-2 bg-gray-900 text-xs font-medium text-white rounded shadow-sm dark:bg-slate-700"
                          role="tooltip">
                          Deactivate this user
                        </span>
                      </button>
                    </div>
                    <div v-else-if="!user.active && user.id" class="hs-tooltip inline-block">
                      <button
                        class="inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border p-1 me-2 border-slate-300 text-gray-700 hover:text-gray-600 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                        @click="activate(user.id)">
                        <IconPlus class="flex-shrink-0" />
                        <span
                          class="hs-tooltip-content hs-tooltip-shown:opacity-100 hs-tooltip-shown:visible opacity-0 transition-opacity inline-block absolute invisible z-10 py-1 px-2 bg-gray-900 text-xs font-medium text-white rounded shadow-sm dark:bg-slate-700"
                          role="tooltip">
                          Activate this user
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
              <tbody v-else>
                <tr class="hover:bg-gray-100 dark:hover:bg-gray-700">
                  <td colspan="4" class="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                    <strong>Looks like no users are available!</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>