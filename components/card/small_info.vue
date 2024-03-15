<script setup lang="ts">
import { Colors } from "@/composables/tabler_utils"
import { IconFileAnalytics, IconCylinder, IconFileText } from "@tabler/icons-vue";

const props = defineProps<{
  icon_id: string,
  text?: string,
  bg_color: Colors,
  text_color: Colors
}>()


</script>



<template>
  <div
    class="flex flex-col grow items-start bg-white/[.5] border border-gray-400 shadow-sm rounded-md p-4 md:p-5 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">

    <div class="flex flex-row items-stretch">
      <!-- Start Icon column -->
      <div v-if="icon_id === 'ID'" class="flex flex-col text-white bg-aruna-800 p-3">
        <IconCylinder class="flex-shrink-0 size-8" />
      </div>
      <div v-if="icon_id === 'Name'" class="flex flex-col text-white bg-aruna-800 p-3">
        <IconFileText class="flex-shrink-0 size-8" />
      </div>
      <div v-if="icon_id === 'Analytics'" class="flex flex-col text-white bg-aruna-800 p-3">
        <IconFileAnalytics class="flex-shrink-0 size-8" />
      </div>
      <!-- End Icon column -->

      <!-- Start Text column -->
      <div class="flex flex-col px-4">
        <div class="text-lg text-gray-600">{{ icon_id }}</div>
        <div class="font-bold text-lg text-aruna-800">{{ text }}</div>
      </div>
      <!-- End Text column -->
    </div>
  </div>



</template>