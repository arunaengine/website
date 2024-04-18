<script setup lang="ts">
import {v2DataClass} from '~/composables/aruna_api_json';

const props = defineProps<{
  dataClass: v2DataClass | undefined
  outline: boolean
}>()
</script>

<template>
  <span v-if="dataClass === v2DataClass.DATA_CLASS_PUBLIC"
        class="m-1 items-center gap-x-1.5 py-1.5 px-3 rounded-md text-xs font-medium bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-500">
    Public
  </span>
  <span v-else-if="dataClass === v2DataClass.DATA_CLASS_PRIVATE"
        class="m-1 items-center gap-x-1.5 py-1.5 px-3 rounded-md text-xs font-medium bg-red-100 text-red-800 dark:bg-red-800/30 dark:text-red-500">
    Private
  </span>
  <span v-else-if="dataClass === v2DataClass.DATA_CLASS_WORKSPACE"
        class="m-1 inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-800/30 dark:text-yellow-500">
    Workspace
  </span>
  <span v-else-if="dataClass === v2DataClass.DATA_CLASS_CONFIDENTIAL"
        class="m-1 inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-white">
    Confidential
  </span>
  <span v-else class="badge badge-outline text-blue">Unknown DataClass</span>
</template>