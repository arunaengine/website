<script setup lang="ts">
import {modelsv2Status} from '~/composables/aruna_api_json';

const props = defineProps<{
  status: modelsv2Status | undefined
}>()
</script>

<template>
    <span v-if="status === modelsv2Status.STATUS_AVAILABLE"
          class="m-1 inline-flex items-center gap-x-1.5 py-1 px-1.5 rounded-md text-md font-medium border border-green-600 text-green-600 dark:text-green-500">
      Available
    </span>
  <span v-else-if="status === modelsv2Status.STATUS_UNAVAILABLE"
        class="m-1 inline-flex items-center gap-x-1.5 py-1 px-1.5 rounded-md text-md font-medium border border-red-600 text-red-600 dark:text-red-500">
      Unavailable
    </span>
  <span v-else
        class="m-1 inline-flex items-center gap-x-1.5 py-1 px-1.5 rounded-md text-md font-medium border border-gray-600 text-gray-600 dark:text-gray-500">
      Unspecified
    </span>
</template>