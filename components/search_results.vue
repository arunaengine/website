<script setup lang="ts">

interface SearchResultListProps {
  resources: Resource[],
  fetching: boolean,
}
const {resources} = defineProps<SearchResultListProps>()
</script>

<template>
  <div v-if="fetching">
    <h2 class="text-aruna-text-accent font-bold text-center">Fetching Results</h2>
  </div>

  <div v-if="resources.length == 0 && !fetching">
    <h2 class="text-aruna-text-accent font-bold text-center">No results found</h2>
  </div>


  <CardResource v-for="hit in resources" :resource="hit" />
</template>