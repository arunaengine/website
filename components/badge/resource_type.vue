<script setup lang="ts">
import {v2ResourceVariant} from '~/composables/aruna_api_json';

const props = defineProps<{
  variant: v2ResourceVariant | undefined
}>()
</script>

<template>
    <span v-if="variant === v2ResourceVariant.RESOURCE_VARIANT_PROJECT"
          class="m-1 inline-flex items-center gap-x-1.5 py-1 px-1.5 rounded-md text-sm font-bold border border-blue-600 text-blue-600 dark:text-blue-500">
      Project
    </span>
  <span v-else-if="variant === v2ResourceVariant.RESOURCE_VARIANT_COLLECTION"
        class="m-1 inline-flex items-center gap-x-1.5 py-1 px-1.5 rounded-md text-md font-medium border border-orange-600 text-orange-600 dark:text-orange-500">
      Collection
    </span>
  <span v-else-if="variant === v2ResourceVariant.RESOURCE_VARIANT_DATASET"
        class="m-1 inline-flex items-center gap-x-1.5 py-1 px-1.5 rounded-md text-md font-medium border border-cyan-600 text-cyan-600 dark:text-cyan-500">
      Dataset
    </span>
  <span v-else-if="variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT"
        class="m-1 inline-flex items-center gap-x-1.5 py-1 px-1.5 rounded-md text-md font-medium border border-green-600 text-green-600 dark:text-green-500">
      Object
    </span>
  <span v-else class="badge badge-outline text-blue">Unknown</span>
</template>