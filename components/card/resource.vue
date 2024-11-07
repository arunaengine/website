<script setup lang="ts">
import {modelsv2Status, v2DataClass, type v2GenericResource, v2ResourceVariant,} from '~/composables/aruna_api_json';

/* ----- PROPERTIES ----- */
interface ResourceCardProps {
  resource: v2GenericResource
}

const {resource} = defineProps<ResourceCardProps>()
const entry = toSearchResult(resource)

/* ----- END PROPERTIES ----- */

function displayDescription(description: string): string {
  if (description.length > 512) {
    return description.slice(0, 512) + " ..."
  }
  return description
}
function displayDataClass(dataClass: v2DataClass): string {
  switch (dataClass) {
    case v2DataClass.DATA_CLASS_PUBLIC: return 'Public'
    case v2DataClass.DATA_CLASS_PRIVATE: return 'Private'
    default: return 'Unspecified'
  }
}
function dataClassCss(dataClass: v2DataClass): string {
  switch (dataClass) {
    case v2DataClass.DATA_CLASS_PUBLIC: return 'border-green-600 text-green-600'
    case v2DataClass.DATA_CLASS_PRIVATE: return 'border-red-600/80 text-red-600/80'
    case v2DataClass.DATA_CLASS_CONFIDENTIAL: return 'border-white text-white'
    case v2DataClass.DATA_CLASS_WORKSPACE: return 'border-indigo-600 text-indigo-600'
    default: return 'border-aruna-text/50 text-aruna-text/50'
  }
}
</script>

<template>
  <div v-if="entry"
       class="flex flex-auto my-3 p-4 gap-x-4 bg-aruna-bg/90 border border-l-4 border-l-aruna-highlight shadow-sm rounded-md border-aruna-text/50"
       :class="{'border-l-destructive': entry.object_status === modelsv2Status.STATUS_DELETED}">
    <div class="flex flex-col basis-1/3 gap-y-3 border-aruna-text/50">
      <!-- Name and ID display with links -->
      <NuxtLink :to="`/objects/${entry.id}`"
                class="text-aruna-highlight font-bold">
        <h3>{{ entry.name }}</h3>
      </NuxtLink>

      <NuxtLink :to="`/objects/${entry.id}`"
                class="text-sm text-aruna-text-accent font-bold">
        <h4>{{ entry.id }}</h4>
      </NuxtLink>
      <!-- END Name and ID display with links -->

      <!-- Badges -->
      <div class="flex flex-col md:flex-row mt-2 gap-x-2 gap-y-2">
        <!-- DataClass Badge -->
        <Badge :class="cn('px-2 py-1 bg-transparent hover:bg-transparent border', dataClassCss(entry.data_class))">
          {{ displayDataClass(entry.data_class) }}
        </Badge>
        <!-- END DataClass -->
        <!-- Stats Badge -->
        <Badge v-if="entry.variant !== v2ResourceVariant.RESOURCE_VARIANT_OBJECT"
               class="px-2 py-1 bg-transparent hover:bg-transparent border border-aruna-text text-aruna-text">
          Children: {{ entry.stats.count }}
        </Badge>
        <Badge class="px-2 py-1 bg-transparent hover:bg-transparent border border-aruna-text text-aruna-text">
          {{ entry.stats.size ? formatBytes(+entry.stats.size) : "N/A Bytes" }}
        </Badge>
        <!-- END Stats Badge -->
      </div>
      <!-- END Badges -->
    </div>

    <div class="mx-2 grow flex-col basis-2/3">
      <h4 class="text-sm my-3 uppercase text-aruna-text-accent">Description</h4>
      <p v-if="entry.description.length > 0" class="mt-2 text-aruna-text">
        {{ displayDescription(entry.description) }}
      </p>

      <hr v-if="entry.key_values.length > 0" class="my-4 text-aruna-text "/>

      <!-- Basic Label Display -->
      <div class="flex flex-row flex-wrap">
        <div v-for="label in entry.key_values" class="flex flex-row my-1 me-2 last:me-0">
          <span
              :class="{ 'me-2 rounded-md': label.value === '' || label.value === undefined, 'rounded-l-md': label.value && label.value.length > 0 }"
              class="text-xs font-medium truncate max-w-60 whitespace-nowrap items-center gap-x-1.5 py-1.5 px-3 rounded-l-md text-aruna-highlight border border-aruna-highlight">
            {{ label.key }}
          </span>
          <span v-if="label.value"
                class="truncate max-w-60 whitespace-nowrap items-center gap-x-1.5 py-1.5 px-3 rounded-r-lg text-xs font-medium border border-l-0 border-aruna-highlight text-aruna-bg bg-aruna-highlight">
            {{ label.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>