<script setup lang="ts">
// The bucket list when no session can open: only the example buckets, from static data.
import { ref } from 'vue'
import MockBucketRows from '@/components/data/manager/MockBucketRows.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import { exampleBuckets } from '@/lib/distributedMockData'

defineProps<{ active: string }>()
const emit = defineEmits<{ (e: 'open', bucket: string): void }>()

const filter = ref('')
const kind = ref('buckets')
const KINDS = [
  { value: 'buckets', label: 'Buckets' },
  { value: 'database', label: 'Databases' },
]
</script>

<template>
  <aside class="space-y-3">
    <div class="surface overflow-hidden">
      <header class="flex items-center justify-between border-b border-border px-3 py-3">
        <h2 class="text-sm font-semibold text-foreground">Buckets</h2>
        <Badge variant="outline" size="count">{{ exampleBuckets(filter).length }}</Badge>
      </header>
      <div class="border-b border-border px-3 py-2">
        <OptionToggle v-model="kind" :options="KINDS" aria-label="Kind of bucket" />
      </div>
      <div class="border-b border-border px-3 py-2">
        <Input v-model="filter" placeholder="Find a bucket" aria-label="Find a bucket" class="h-8 text-xs" />
      </div>
      <ul class="max-h-[420px] overflow-y-auto py-1">
        <MockBucketRows :database-only="kind === 'database'" :filter="filter" :active="active" @open="emit('open', $event)" />
      </ul>
    </div>
  </aside>
</template>
