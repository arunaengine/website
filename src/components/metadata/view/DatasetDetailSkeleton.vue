<script setup lang="ts">
// The whole dataset page in placeholder form: hero, details, people and
// files in their final places, so the loaded page replaces it in one step.
import ListSkeleton from '@/components/ui/ListSkeleton.vue'
import SectionSkeleton from '@/components/ui/SectionSkeleton.vue'
</script>

<template>
  <div class="space-y-6" aria-busy="true">
    <span class="sr-only">Loading the dataset</span>
    <SectionSkeleton :header="false" :lines="4" :tiles="4" />
    <SectionSkeleton :lines="3" />
    <SectionSkeleton :lines="2" />
    <ListSkeleton header :rows="4" />
  </div>
</template>
