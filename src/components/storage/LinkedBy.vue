<script setup lang="ts">
// Datasets that link this bucket, or a folder of it, as a part.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import RowList from '@/components/distributed/RowList.vue'
import { useMockDatabases } from '@/composables/useMockDatabases'
import { partLabel } from '@/lib/distributedMockData'
import { Link2 } from '@lucide/vue'

const props = defineProps<{ bucket: string }>()

const { linkedBy } = useMockDatabases()
const rows = computed(() => linkedBy(props.bucket).map((link) => ({ key: link.dataset.id + partLabel(link.part), label: link.dataset.name, value: partLabel(link.part), id: link.dataset.id })))
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <Link2 class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Linked by datasets</h2>
    </header>
    <div class="px-5 py-4">
      <p v-if="!rows.length" class="text-xs text-muted-foreground">None</p>
      <RowList v-else :rows="rows">
        <template v-for="row in rows" :key="row.key" #[row.key]>
          <RouterLink :to="{ name: 'dataset', params: { id: row.id } }" class="text-primary hover:underline">{{ row.value }}</RouterLink>
        </template>
      </RowList>
    </div>
  </section>
</template>
