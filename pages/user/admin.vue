<script setup lang="ts">
import {IconCheck, IconMinus, IconPlus, IconSearch, IconX} from '@tabler/icons-vue'
import type {v2User} from '~/composables/aruna_api_json'

const users: Ref<v2User[] | undefined> = ref(undefined)
const forceRefresh = ref(0)

async function fillUsers() {
  users.value = await fetchUsers()

  // Sort by admin status, then name and then id (just in case)
  if (users.value && users.value.every(user => user.attributes?.globalAdmin !== undefined)) {
    users.value.sort((a, b) => {
      if (a.attributes?.globalAdmin && !b.attributes?.globalAdmin)
        return -1
      else if (!a.attributes?.globalAdmin && b.attributes?.globalAdmin)
        return 1
      else if (a.displayName && b.displayName)
        return a.displayName.localeCompare(b.displayName)
      else
        return (a.id || '').localeCompare(b.id || '')
    })
  }

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
  <NavigationTop/>

  <div class="min-h-[calc(100vh-110px)]">
    <div class="md:container sm:mx-1 md:mx-auto mt-10 p-4 border border-aruna-text rounded-lg bg-aruna-bg/90">
      <h1 class="text-3xl font-bold text-white">
        User Administration
      </h1>
      <Separator class="bg-aruna-text my-4"/>

      <div class="flex flex-col">
        <div class="-m-1.5 overflow-x-auto">
          <div class="p-1.5 min-w-full inline-block align-middle">
            <div class="overflow-hidden">
              <table class="min-w-full divide-y divide-aruna-text">
                <thead>
                <tr>
                  <th scope="col" class="px-6 py-3 text-start text-md font-medium text-aruna-text-accent uppercase">ID</th>
                  <th scope="col" class="px-6 py-3 text-start text-md font-medium text-aruna-text-accent uppercase">Name</th>
                  <th scope="col" class="px-6 py-3 text-start text-md font-medium text-aruna-text-accent uppercase">Email</th>
                  <th scope="col" class="px-6 py-3 text-center text-md font-medium text-aruna-text-accent uppercase">Status</th>
                  <th scope="col" class="px-6 py-3 text-center text-md font-medium text-aruna-text-accent uppercase">Actions</th>
                </tr>
                </thead>

                <tbody v-if="users" class="divide-y divide-aruna-text/50">
                <tr v-for="user in users"
                    :key="forceRefresh"
                    class="hover:bg-aruna-fg">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
                    {{ user.id }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-aruna-text">
                    {{ user.displayName }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-aruna-text">
                    {{ user.email ? user.email : "No email provided" }}
                  </td>
                  <td
                      class="flex justify-center space-x-2 px-6 py-4 whitespace-nowrap text-center content-center text-sm text-aruna-text">
                    <span v-if="user.attributes?.globalAdmin"
                          class="inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-full text-xs font-medium text-red-500 bg-red-800/30 ">
                      Admin
                    </span>
                    <span v-else
                          class="inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-full text-xs font-medium text-aruna-highlight bg-aruna-highlight/50">
                      User
                    </span>

                    <span v-if="user.active"
                          class="py-1.5 px-3 inline-flex items-center gap-x-1 text-xs font-medium rounded-full bg-teal-100 text-teal-500 bg-teal-500/10">
                      <IconCheck class="flex-shrink-0 size-4"/>
                      Active
                    </span>
                    <span v-else
                          class="py-1 px-1.5 inline-flex items-center gap-x-1 text-xs font-medium rounded-full bg-red-100 text-red-500 bg-red-500/10">
                      <IconX class="flex-shrink-0 size-3"/>
                      Disabled
                    </span>
                  </td>

                  <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                    <Button variant="ghost"
                            disabled
                            class="me-2 p-1 rounded-sm border border-aruna-text text-aruna-text disabled:border-aruna-text/50 disabled:text-aruna-text/50">
                      <IconSearch/>
                    </Button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <Button v-if="user.active && user.id"
                                  variant="ghost"
                                  @click="deactivate(user.id)"
                                  class="me-2 p-1 rounded-sm border border-aruna-text text-aruna-text disabled:border-aruna-text/50 disabled:text-aruna-text/50">
                            <IconMinus class="flex-shrink-0"/>
                          </Button>
                          <Button v-if="!user.active && user.id"
                                  variant="ghost"
                                  @click="activate(user.id)"
                                  class="me-2 p-1 rounded-sm border border-aruna-text text-aruna-text disabled:border-aruna-text/50 disabled:text-aruna-text/50">
                            <IconPlus class="flex-shrink-0"/>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent class="rounded-sm border-aruna-text bg-aruna-muted text-aruna-text">
                          <p>{{ user.active && user.id ? 'Deactivate' : 'Activate' }} this user</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                </tr>
                </tbody>
                <tbody v-else>
                <tr>
                  <td colspan="5" class="px-6 py-4 whitespace-nowrap text-center text-md text-aruna-text-accent">
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
  </div>

  <Footer/>
</template>