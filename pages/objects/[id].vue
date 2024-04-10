<script setup lang="ts">
import {
  IconArrowLeft, IconArrowsSplit, IconExternalLink, IconFileInfo, IconTag, IconWebhook
} from '@tabler/icons-vue';

const route = useRoute()
const objectInfo = await useFetch(`/api/resource?resourceId=${route.params.id}`).then(res => {
  const resource = res.data.value
  if (resource) {
    try {
      return toObjectInfo(resource.resource, resource.permission)
    } catch (error) {
      console.log(error)
    }
  }

  console.log(res.error.value)
  return undefined
}, error => {
  console.log(error)
  return undefined
})

/* Back link to last page in navigation history */
const router = useRouter()
function goBack() {
  router.back()
}
</script>

<template>

  <NavigationTop />

  <div class="flex flex-wrap justify-between container mx-auto mt-10">
    <h1 class="text-3xl font-bold text-gray-700 dark:text-white my-4">
      Overview Resource
    </h1>
    <button @click="router.back()"
      class="cursor-pointer px-4 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-blue-600 hover:bg-blue-100 hover:text-blue-800 disabled:opacity-50 disabled:pointer-events-none dark:text-blue-500 dark:hover:bg-blue-800/30 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
      <IconArrowLeft class="icon" />
    </button>
  </div>

  <!-- Badge row -->
  <div class="flex flex-wrap container mx-auto mb-6">
    <div class="flex sm:flex-row md:flex-col">
      <BadgeResourceType :variant="objectInfo?.variant" />
    </div>
    <div class="flex sm:flex-row md:flex-col">
      <BadgeDataclass :dataClass="objectInfo?.data_class" :outline="true" />
    </div>
    <div class="flex sm:flex-row md:flex-col">
      <BadgeResourceStatus :status="objectInfo?.object_status" />
    </div>
    <div class="flex sm:flex-row md:flex-col">
      <BadgeResourceLicense :license="objectInfo?.license" :meta="true" />
    </div>
    <div class="flex sm:flex-row md:flex-col">
      <BadgeResourceLicense :license="objectInfo?.license" :meta="false" />
    </div>
    <div class="flex sm:flex-row md:flex-col">
      <BadgeResourcePermission :permission="objectInfo?.permission" />
    </div>
  </div>

  <div class="flex flex-wrap justify-between gap-x-6 gap-y-2 container mx-auto mb-6">
    <CardSmallInfo :icon_id='"ID"' :text="objectInfo?.id" />
    <CardSmallInfo :icon_id='"Name"' :text="objectInfo?.name" />
    <CardStats :stats="objectInfo?.stats" />
  </div>

  <div class="flex items-center container mx-auto mb-6">
    <div class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 text-gray-600 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
      <div class="flex flex-row justify-start items-center p-4 font-bold text-2xl">
        <IconFileInfo class="flex-shrink-0 size-6 me-2 text-gray-600/[.75]" /> Description
      </div>

      <div class="flex grow p-4 text-gray-700 text-xl border-t border-gray-300 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
        {{ objectInfo?.description }}
      </div>
    </div>
  </div>

  <div class="flex flex-wrap justify-between gap-x-4 gap-y-2 container mx-auto mb-6">
    <div class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
      <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
        <IconTag class="flex-shrink-0 size-6 me-4" />
        <span class="">Labels</span>
      </div>
      <CardLabels :key_values="objectInfo?.key_values" />
    </div>

    <div class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
      <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
        <IconWebhook class="flex-shrink-0 size-6 me-4" />
        <span class="">Hooks</span>
      </div>
      <CardHooks :key_values="objectInfo?.key_values" />
    </div>
  </div>

  <div class="flex flex-wrap justify-center gap-x-4 gap-y-2 container mx-auto mb-6">
    <div class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
      <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
        <IconExternalLink class="flex-shrink-0 size-6 me-4" />
        <span class="">External Relations</span>
      </div>
      <CardRelations :relations="objectInfo?.relations" :external="true" />
    </div>

    <div class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
      <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
        <IconArrowsSplit class="flex-shrink-0 size-6 me-4" />
        <span class="">Internal Relations</span>
      </div>
      <CardRelations :relations="objectInfo?.relations" :external="false" />
    </div>
  </div>
</template>