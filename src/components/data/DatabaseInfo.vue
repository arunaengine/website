<script setup lang="ts">
// What the realm admins wrote about a database bucket. The bucket itself is an ordinary bucket.
import { computed } from 'vue'
import DetailList from '@/components/ui/DetailList.vue'
import { useMockDatabases } from '@/composables/useMockDatabases'

const props = defineProps<{ bucket: string }>()

const { entries } = useMockDatabases()
const entry = computed(() => entries.value.find((item) => item.bucket === props.bucket))
</script>

<template>
  <section v-if="entry" class="space-y-2">
    <h3 class="text-sm font-medium text-foreground">Database bucket</h3>
    <p class="text-sm text-muted-foreground">{{ entry.description }}</p>
    <DetailList
      :items="[
        { label: 'Source', value: entry.source },
        { label: 'License', value: entry.license },
        { label: 'Refresh', value: entry.refresh },
        { label: 'Who may read', value: entry.readers },
      ]"
    />
  </section>
</template>
