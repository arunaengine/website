<script setup lang="ts">
import { IconIdBadge2 } from "@tabler/icons-vue";
import type { v2Stats } from "~/composables/aruna_api_json";

const props = defineProps<{
  name: string,
  title: string | undefined
}>()
</script>

<template>

  <div
    class="flex flex-col grow items-start bg-white/[.5] border border-gray-400 shadow-sm p-4 md:p-5 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
    <div class="flex flex-row grow">
      <!-- Big Icon Column -->
      <div class="flex flex-col text-white bg-aruna-700 p-3">
        <IconIdBadge2 class="flex-shrink-0 size-8" />
      </div>
      <!-- End Big Icon Column -->

      <!-- Name Column -->
      <div class="flex flex-col ms-6">
        <div class="flex flex-row space-x-2 border-gray-400">
          <div class="text-lg text-gray-600 dark:text-gray-400">Name: </div>
          <div class="font-bold text-xl text-gray-600 dark:text-gray-500">{{ props.name }}</div>
        </div>

        <div class="flex flex-row space-x-2 border-gray-400">
          <div class="text-lg text-gray-600 dark:text-gray-400">Title: </div>
          <div v-if="props.title" class="font-bold text-xl text-gray-600 dark:text-gray-500">{{ props.title }}</div>
          <div v-else class="font-bold text-xl text-gray-600 dark:text-gray-500">N/A</div>
        </div>
      </div>

      <!-- End Name Column -->

      <!-- Title Column -->

      <!-- End Stats Title Column -->
    </div>
  </div>
</template>