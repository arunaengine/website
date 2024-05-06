<script setup lang="ts">
import {IconArrowLeft} from '@tabler/icons-vue';
import {modelsv2Status, type v2ResourceWithPermission, type v2User} from "~/composables/aruna_api_json";

// Check refresh and access before navigation

//TODO: GetUserResources
const userRef: Ref<v2User | undefined> = inject('userRef', ref(undefined))
let resources: v2ResourceWithPermission[] = []
const display: Ref<v2ResourceWithPermission[]> = ref([])

const displayDeleted = ref(false)
const forceRefresh = ref(0)
watch(displayDeleted, () => fillDisplay())

async function fetchResources() {
  // Wait for user injection
  while (userRef.value === undefined) {
    await sleep(100)
  }
  resources = await fetchUserResources(userRef.value)
}

function fillDisplay() {
  if (resources) {
    display.value = !displayDeleted.value ? resources.filter(ele => {
      // Currently assuming only projects were fetched
      return ele.resource?.project?.status !== modelsv2Status.STATUS_DELETED
    }) : resources
  } else {
    display.value = []
  }
  forceRefresh.value++
}

onMounted(async () => {
  await fetchResources()
  fillDisplay()
})

// Used for back link to last page in navigation history
const router = useRouter()
const sleep = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay))
</script>

<template>
  <NavigationTop/>

  <div class="flex flex-wrap justify-between container mx-auto my-10">
    <h1 class="text-3xl font-bold text-gray-700 dark:text-white">
      Projects of {{ userRef?.displayName }}
    </h1>
    <button @click="router.back()"
            class="cursor-pointer px-4 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-gray-700 hover:bg-gray-300 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/30 dark:hover:text-gray-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
      <IconArrowLeft class="icon"/>
    </button>
  </div>

  <div class="flex md:container sm:mx-1 md:mx-auto mt-4 p-4 border border-gray-500 rounded-lg ">
    <div class="flex flex-col grow">
      <div class="flex flex-row grow justify-between">
        <div class="flex items-center">
          <input type="checkbox"
                 v-model="displayDeleted"
                 id="display-deleted-checkbox"
                 class="relative w-[3.25rem] h-7 p-px bg-gray-500 border-transparent text-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:ring-transparent disabled:opacity-50 disabled:pointer-events-none checked:bg-none checked:text-aruna-800 checked:border-aruna-800 focus:checked:border-aruna-800 dark:bg-neutral-800 dark:border-neutral-700 dark:checked:bg-blue-500 dark:checked:border-blue-500 dark:focus:ring-offset-gray-600
                        before:inline-block before:size-6 before:bg-white checked:before:bg-blue-200 before:translate-x-0 checked:before:translate-x-full before:rounded-full before:shadow before:transform before:ring-0 before:transition before:ease-in-out before:duration-200 dark:before:bg-neutral-400 dark:checked:before:bg-blue-200">
          <label for="display-deleted-checkbox" class="text-sm text-gray-600 ms-3 dark:text-neutral-400">
            Display deleted resources
          </label>
        </div>
        <a href="/objects/create"
           class="py-1 px-2 mt-2 inline-flex gap-x-2 text-md rounded-lg bg-aruna-800 border border-gray-200 text-slate-100 hover:border-aruna-800 hover:text-gray-400 disabled:opacity-50 disabled:pointer-events-none dark:border-gray-700 dark:text-gray-400 dark:hover:text-blue-500 dark:hover:border-blue-600 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
          Create new resource
        </a>
      </div>

      <hr class="my-5 border-gray-500 dark:border-gray-200">

      <div class="flex flex-col grow">
        <div :key="forceRefresh" v-for="resource in display" class="flex flex-row grow">
          <CardResource v-if="resource.resource" :resource="resource.resource"/>
        </div>
        <div class="flex flex-col grow" v-if="resources.length == 0">
          Seems like you do not own any resources.
        </div>
      </div>
    </div>
  </div>

  <Footer/>
</template>