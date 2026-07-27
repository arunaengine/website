<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EntityFieldList from '@/components/metadata/EntityFieldList.vue'
import type { PresentedField } from '@/lib/cratePresenter'
import { Info } from '@lucide/vue'

// The root dataset's remaining properties as a profile-labeled ledger. Also
// carries the crate loading / not-ready / error notice for the whole page.
const props = defineProps<{
  fields: PresentedField[]
  loading?: boolean
  preparing?: boolean
  notReady?: boolean
  error?: string | null
}>()
const emit = defineEmits<{ (e: 'retry'): void; (e: 'jump', id: string): void }>()

const visible = computed(
  () => props.fields.length > 0 || Boolean(props.loading) || Boolean(props.notReady) || Boolean(props.error),
)
</script>

<template>
  <section v-if="visible" class="surface overflow-hidden">
    <div class="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
      <Info class="h-4 w-4 text-primary" /> Details
      <span v-if="fields.length" class="text-xs font-normal text-muted-foreground">{{ fields.length }}</span>
    </div>

    <div v-if="loading && !fields.length" class="space-y-2.5 px-5 py-4">
      <div v-for="n in 3" :key="n" class="flex items-center gap-6">
        <Skeleton class="h-3.5 w-36" />
        <Skeleton class="h-3.5 w-56" />
      </div>
      <p class="pt-1 text-xs text-muted-foreground">{{ preparing ? 'Preparing the crate…' : 'Loading full RO-Crate…' }}</p>
    </div>

    <div v-else-if="notReady" class="flex items-center gap-3 px-5 py-4 text-xs text-muted-foreground">
      <span>The crate is still being prepared.</span>
      <Button variant="outline" size="sm" @click="emit('retry')">Retry</Button>
    </div>
    <p v-else-if="error" class="px-5 py-4 text-xs text-destructive">{{ error }}</p>

    <div v-else class="px-5 py-3">
      <EntityFieldList :fields="fields" @jump="(id) => emit('jump', id)" />
    </div>
  </section>
</template>
