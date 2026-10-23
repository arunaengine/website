<script setup lang="ts">
// Datasets that link this bucket, or a folder of it, as a part. Nothing is stored per file.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useMockDatabases } from '@/composables/useMockDatabases'
import { partLabel } from '@/lib/distributedMockData'
import { Link2 } from '@lucide/vue'

const props = defineProps<{ bucket: string }>()

const { linkedBy } = useMockDatabases()
const links = computed(() => linkedBy(props.bucket))
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <Link2 class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Linked by datasets</h2>
    </header>
    <div class="px-5 py-4 text-sm">
      <p v-if="!links.length" class="text-muted-foreground">No dataset links this bucket.</p>
      <ul v-else class="space-y-1.5">
        <li v-for="link in links" :key="link.dataset.id + partLabel(link.part)">
          <RouterLink :to="{ name: 'dataset', params: { id: link.dataset.id } }" class="font-medium text-primary hover:underline">{{ link.dataset.name }}</RouterLink>
          <span class="text-muted-foreground"> links {{ partLabel(link.part) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
