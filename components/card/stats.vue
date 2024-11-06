<script setup lang="ts">
import {IconFileAnalytics} from "@tabler/icons-vue";
import type {v2Stats} from "~/composables/aruna_api_json";

const props = defineProps<{
  stats: v2Stats | undefined
}>()
</script>

<template>

  <div class="flex flex-col grow items-start bg-aruna-bg/90 border border-aruna-text/50 shadow-sm p-4 md:p-5 text-aruna-text">
    <div class="flex flex-row grow">
      <!-- Big Icon Column -->
      <div class="flex flex-col items-center justify-center text-aruna-highlight">
        <IconFileAnalytics class="flex-shrink-0 size-10"/>
      </div>
      <!-- End Big Icon Column -->

      <!-- Stats Count Column -->
      <div class="flex flex-col px-4 me-6 border-e border-aruna-text/50">
        <div class="text-lg text-aruna-text">Count</div>
        <div class="font-bold text-xl text-aruna-text-accent">{{ stats?.count }}</div>
      </div>
      <!-- END Stats Count Column -->

      <!-- Stats Size Column -->
      <div class="flex flex-col basis-1/2">
        <div class="text-lg text-aruna-text">Size</div>
        <div v-if="stats?.size" class="font-bold text-xl text-aruna-text-accent">{{
            formatBytes(+stats.size)
          }}
        </div>
        <div v-else class="flex flex-col">N/A Bytes</div>
      </div>
      <!-- END Stats Size Column -->
    </div>
  </div>
</template>