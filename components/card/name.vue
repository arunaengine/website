<script setup lang="ts">
import {IconIdBadge2} from "@tabler/icons-vue";
import type {v2Stats} from "~/composables/aruna_api_json";

const props = defineProps<{
  name: string,
  title: string | undefined
}>()
</script>

<template>

  <div class="flex flex-col grow items-start bg-aruna-muted border border-aruna-text/50 shadow-sm p-4 md:p-5 text-aruna-text">
    <div class="flex flex-row grow">
      <!-- Big Icon Column -->
      <div class="flex flex-col items-center justify-center text-aruna-highlight">
        <IconIdBadge2 class="flex-shrink-0 size-10"/>
      </div>
      <!-- END Big Icon Column -->

      <!-- Name & Title Column -->
      <div class="flex flex-col ms-6">
        <div class="flex flex-row space-x-2 border-aruna-text/50">
          <div class="text-lg text-aruna-text">Name:</div>
          <div class="font-bold text-xl text-aruna-text-accent">{{ props.name }}</div>
        </div>

        <div class="flex flex-row space-x-2 border-aruna-text/50">
          <div class="text-lg text-aruna-text">Title:</div>
          <div v-if="props.title" class="font-bold text-xl text-aruna-text-accent">{{ props.title }}</div>
          <div v-else class="font-bold text-xl text-aruna-text-accent">N/A</div>
        </div>
      </div>
      <!-- END Name Column -->
    </div>
  </div>
</template>