<script setup lang="ts">
import { IconFileAnalytics } from "@tabler/icons-vue";
import type { v2Stats } from "~/composables/aruna_api_json";

const props = defineProps<{
  stats: v2Stats | undefined
}>()
</script>

<template>

  <div
    class="flex flex-col grow items-start bg-white/[.5] border border-gray-400 shadow-sm p-4 md:p-5 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
    <div class="flex flex-row grow">
      <!-- Big Icon Column -->
      <div class="flex flex-col text-white bg-green-800 p-3">
        <IconFileAnalytics class="flex-shrink-0 size-8" />
      </div>
      <!-- End Big Icon Column -->

      <!-- Stats Count Column -->
      <div class="flex flex-col px-4 me-6 border-e border-gray-400">
        <div class="text-lg text-gray-600 dark:text-gray-400">Count</div>
        <div class="font-bold text-xl text-gray-600 dark:text-gray-500">{{ stats?.count }}</div>
      </div>
      <!-- End Stats Count Column -->

      <!-- Stats Size Column -->
      <div class="flex flex-col basis-1/2">
        <div class="text-lg text-gray-600 dark:text-gray-400">Size</div>
        <div v-if="stats?.size" class="font-bold text-xl text-gray-600 dark:text-gray-500">{{ formatBytes(+stats.size) }}</div>
        <div v-else class="flex flex-col">N/A Bytes</div>
      </div>
      <!-- End Stats Size Column -->
    </div>
  </div>
</template>