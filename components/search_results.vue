<script setup lang="ts">
import type {v2GenericResource} from '@/composables/aruna_api_json';

const props = defineProps<{
  resources: v2GenericResource[]
}>()
</script>

<template>
  <CardResource v-for="hit in resources" :resource="hit" />

  <div v-if="resources.length == 0">
    <h2 class="text-slate-500 font-bold text-center">No results found</h2>
  </div>
</template>