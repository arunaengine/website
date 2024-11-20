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
watch(displayDeleted, () => {
  console.log(displayDeleted)
  fillDisplay()
})

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

  <div class="min-h-[calc(100vh-110px)]">
    <div class="flex md:container sm:mx-1 md:mx-auto my-10 p-4 border border-aruna-text/50 rounded-md bg-muted/40">
      <div class="flex flex-col grow">
        <div class="flex flex-row grow justify-between">
          <div class="flex items-center space-x-2">
            <Switch @update:checked="(v) => displayDeleted = v"
                    id="display-deleted"
                    class="border border-aruna-text/50 data-[state=checked]:bg-aruna-highlight data-[state=unchecked]:bg-aruna-text/50"/>
            <Label for="display-deleted">Display deleted resources</Label>
          </div>
          <NuxtLink to="/objects/create"
                    class="py-1 px-2 mt-2 inline-flex gap-x-2 text-md rounded-md bg-transparent border border-aruna-highlight text-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent">
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