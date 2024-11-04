<script setup lang="ts">
import { IconFileAnalytics, IconId, IconFileText } from "@tabler/icons-vue";

const props = defineProps<{
  icon_id: string,
  text?: string,
}>()


</script>



<template>
  <div
    class="flex flex-col grow items-start bg-aruna-muted border border-aruna-text/50 shadow-sm p-4 md:p-5 text-aruna-text">
    <div class="flex flex-row items-stretch">
      <!-- Icon column -->
      <div v-if="icon_id === 'ID'"
           class="flex flex-col items-center justify-center text-aruna-highlight">
        <IconId class="flex-shrink-0 size-10" />
      </div>
      <div v-if="icon_id === 'Name'"
           class="flex flex-col items-center justify-center text-aruna-highlight">
        <IconFileText class="flex-shrink-0 size-10" />
      </div>
      <div v-if="icon_id === 'Analytics'"
           class="flex flex-col items-center justify-center text-aruna-highlight">
        <IconFileAnalytics class="flex-shrink-0 size-10" />
      </div>
      <!-- End Icon column -->

      <!-- Text column -->
      <div class="flex flex-col px-4">
        <div class="text-lg text-aruna-text">{{ icon_id }}</div>
        <div class="font-bold text-lg text-aruna-text-accent">{{ text }}</div>
      </div>
      <!-- End Text column -->
    </div>
  </div>
</template>