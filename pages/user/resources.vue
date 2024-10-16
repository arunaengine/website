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

  <div class="min-h-[calc(100vh-120px)]">
    <div class="flex md:container sm:mx-1 md:mx-auto my-10 p-4 border border-gray-500 rounded-md bg-muted/40">
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
          <NuxtLink to="/objects/create"
                    class="py-1 px-2 mt-2 inline-flex gap-x-2 text-md rounded-sm bg-aruna-800 border text-white hover:bg-aruna-700">
            Create new resource
          </NuxtLink>
        </div>

        <Separator class="my-5 bg-gray-500"/>

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
  </div>
  <Footer/>
</template>