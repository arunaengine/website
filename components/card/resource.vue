<script setup lang="ts">
import {
  IconHash
} from '@tabler/icons-vue';

import {
  type v2KeyValue,
  v2KeyValueVariant,
  type v2GenericResource,
} from '~/composables/aruna_api_json';

const props = defineProps<{
  resource: v2GenericResource
}>()
const entry = toSearchResult(props.resource)

function filterKeyValues(keyValues: v2KeyValue[] | undefined, variant: v2KeyValueVariant | undefined): v2KeyValue[] {
  //TODO
  return []
}
</script>

<template>
  <div
      class="flex flex-auto my-3 p-4 gap-x-4 bg-white border border-l-4 border-l-aruna-700 shadow-sm rounded-xl dark:bg-slate-900 dark:border-gray-700 dark:border-t-blue-500 dark:shadow-slate-700/[.7]">
    <div class="flex flex-col basis-1/3 gap-y-3 border-e-gray-600">

      <!--
      <div v-if="entry?.variant === v2ResourceVariant.RESOURCE_VARIANT_PROJECT" class="ribbon bg-blue">Project</div>
      <div v-else-if="entry?.variant === v2ResourceVariant.RESOURCE_VARIANT_COLLECTION" class="ribbon bg-orange">
        Collection
      </div>
      <div v-else-if="entry?.variant === v2ResourceVariant.RESOURCE_VARIANT_DATASET" class="ribbon bg-cyan">Dataset
      </div>
      <div v-else-if="entry?.variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT" class="ribbon bg-green">Object</div>
      <div v-else class="ribbon bg-pink">Unknown</div>
      -->

      <!-- Start Name and ID display with links -->
      <NuxtLink :to="`/objects/${entry?.id}`" class="text-aruna-800 font-bold">
        <h3>{{ entry?.name }}</h3>
      </NuxtLink>

      <NuxtLink :to="`/objects/${entry?.id}`" class="text-sm text-slate-400 font-bold">
        <h4>{{ entry?.id }}</h4>
      </NuxtLink>
      <!-- End Name and ID display with links -->

      <div class="flex sm:flex-col md:flex-row">
        <!-- Start DataClass -->
        <BadgeDataclass :dataClass="entry?.data_class"/>
        <!-- End DataClass -->

        <!-- Start Stats -->
        <span class="mx-1 inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-full text-xs font-bold border border-yellow-500 text-yellow-500">
          Count <!--<IconHash class="flex-shrink-0 size-3"/>--> {{ entry?.stats.count }}
        </span>
        <!-- <span class="status status-yellow m-1">Count: {{ entry?.stats.count }}</span>-->
        <span v-if="entry?.stats.size" class="mx-1 inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-full text-xs font-bold border border-cyan-500 text-cyan-500">
          {{ formatBytes(+entry?.stats.size) }}
        </span>
        <!-- End Stats -->
      </div>
    </div>

    <div class="mx-2 grow flex-col basis-2/3">
      <h4 class="text-sm my-3 uppercase text-gray-500 dark:text-gray-400">Description</h4>
      <p v-if="entry?.description.length > 0" class="mt-2 text-gray-600 dark:text-gray-200">{{ entry?.description }}</p>

      <hr v-if="entry?.key_values.length > 0" class="my-4 text-gray-500 "/>

      <div v-for="label in entry?.key_values" class="d-inline-flex tag">
        <div class="key text-secondary">{{ label.key }}</div>
        <div v-if="label.value" class="value">{{ label.value }}</div>
      </div>
    </div>
  </div>
</template>