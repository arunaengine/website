<script setup lang="ts">
import type {v2GenericResource} from '@/composables/aruna_api_json';

interface SearchResultListProps {
  resources: v2GenericResource[]
}
const {resources} = defineProps<SearchResultListProps>()
</script>

<template>
  <div v-if="resources.length == 0">
    <h2 class="text-aruna-text-accent font-bold text-center">No results found</h2>
  </div>

  <CardResource v-for="hit in resources" :resource="hit" />
</template>