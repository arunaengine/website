<script setup lang="ts">
import { IconArrowLeft, IconPlus } from '@tabler/icons-vue';
import { v2DataClass } from '~/composables/aruna_api_json/models/v2DataClass';
import type { v2User } from "~/composables/aruna_api_json/models/v2User";

// Check refresh and access before navigation

//TODO: GetUserResources
const user_state: globalThis.Ref<v2User | undefined> = useState("user")
const isLoggedIn = computed(() => user_state.value !== undefined)

const resources = await fetchUserResources(user_state.value)
console.log(resources)

const name = ref('')
const description = ref('')

async function tryCreateProject() {
  console.log(name.value)
  console.log(description.value)

  const project = await createProject(name.value, description.value, [], v2DataClass.DATA_CLASS_PUBLIC, '', '')
  console.log("Successfully created Project: " + project)
}

// Used for back link to last page in navigation history
const router = useRouter()
</script>

<template>
  <NavigationTop />

  <div class="flex flex-wrap justify-between container mx-auto my-10">
    <h1 class="text-3xl font-bold text-gray-700 dark:text-white">
      Projects of {{ user_state?.displayName }}
    </h1>
    <button @click="router.back()"
      class="cursor-pointer px-4 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-gray-700 hover:bg-gray-300 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/30 dark:hover:text-gray-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
      <IconArrowLeft class="icon" />
    </button>
  </div>

  <div class="flex md:container sm:mx-1 md:mx-auto mt-4 p-4 border border-gray-500 rounded-lg ">
    <div class="flex flex-col grow">
      <div class="flex flex-row grow justify-end">
        <a href="/objects/create"
          class="py-1 px-2 mt-2 inline-flex gap-x-2 text-md rounded-lg bg-aruna-800 border border-gray-200 text-slate-100 hover:border-aruna-800 hover:text-gray-400 disabled:opacity-50 disabled:pointer-events-none dark:border-gray-700 dark:text-gray-400 dark:hover:text-blue-500 dark:hover:border-blue-600 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
          Create new resouce
      </a>
      </div>

      <div class="flex flex-row grow">
        <div v-for="resource in resources" class="flex flex-row grow">
          <CardResource v-if="resource.resource" :resource="resource.resource" />
        </div>
        <div class="flex flex-col grow" v-if="resources.length == 0">
          Seems like you do not own any resources.
        </div>
      </div>
    </div>
  </div>

  <Footer />
</template>