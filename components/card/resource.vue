<script setup lang="ts">
import {modelsv2Status, type v2GenericResource,} from '~/composables/aruna_api_json';

const props = defineProps<{
  resource: v2GenericResource
}>()
const entry = toSearchResult(props.resource)

function displayDescription(description: string): string {
  if (description.length > 1000) {
    return description.slice(0, 1000) + " ..."
  }
  return description
}
</script>

<template>
  <div v-if="entry"
    class="flex flex-auto my-3 p-4 gap-x-4 bg-white border border-l-4 border-l-aruna-700 shadow-sm rounded-xl dark:bg-slate-900 dark:border-gray-700 dark:border-t-blue-500 dark:shadow-slate-700/[.7]"
    :class="{'border-l-red-500': entry.object_status === modelsv2Status.STATUS_DELETED}">
    <div class="flex flex-col basis-1/3 gap-y-3 border-e-gray-600">
      <!-- Start Name and ID display with links -->
      <NuxtLink :to="`/objects/${entry.id}`" class="text-aruna-800 font-bold">
        <h3>{{ entry.name }}</h3>
      </NuxtLink>

      <NuxtLink :to="`/objects/${entry.id}`" class="text-sm text-slate-400 font-bold">
        <h4>{{ entry.id }}</h4>
      </NuxtLink>
      <!-- End Name and ID display with links -->

      <div class="flex sm:flex-col md:flex-row">
        <!-- Start DataClass -->
        <BadgeDataclass :dataClass="entry.data_class" :outline="true" />
        <!-- End DataClass -->

        <!-- Start Stats -->
        <BadgeStats :count="entry.stats.count" :objectSize="entry.stats.size" />
        <!-- End Stats -->
      </div>
    </div>

    <div class="mx-2 grow flex-col basis-2/3">
      <h4 class="text-sm my-3 uppercase text-gray-500 dark:text-gray-400">Description</h4>
      <p v-if="entry.description.length > 0" class="mt-2 text-gray-600 dark:text-gray-200">
        {{displayDescription(entry.description) }}
      </p>

      <hr v-if="entry.key_values.length > 0" class="my-4 text-gray-500 " />

      <!-- Basic Label Display -->
      <div class="flex flex-row flex-wrap space-x-4">
        <div v-for="label in entry.key_values" class="flex flex-row my-1">
          <span :class="{ 'me-2 rounded-lg': label.value === '' || label.value === undefined, 'rounded-l-lg': label.value && label.value.length > 0 }"
            class="inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-l-lg text-xs font-medium bg-aruna-800 text-slate-300 dark:bg-blue-800/30 dark:text-blue-500">
            {{ label.key }}
          </span>
          <!-- <div class="key text-secondary">{{ label.key }}</div> -->
          <span v-if="label.value"
            class="inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-r-lg text-xs font-medium border text-blue-800 dark:bg-blue-800/30 dark:text-blue-500">
            {{label.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>