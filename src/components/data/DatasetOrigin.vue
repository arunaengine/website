<script setup lang="ts">
// The isBasedOn entries the dataset editor adds on its own when this file joins a dataset.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import { basedOn, type Origin } from '@/lib/distributedMockData'

const props = defineProps<{ origin: Origin }>()

const removed = ref<string[]>([])
const entries = computed(() => basedOn(props.origin).filter((entry) => !removed.value.includes(entry.value)))
</script>

<template>
  <div class="space-y-1.5">
    <p v-if="!basedOn(origin).length" class="text-muted-foreground">Nothing is added: this file was uploaded directly.</p>
    <ul v-else class="space-y-1">
      <li v-for="entry in entries" :key="entry.value" class="flex items-center gap-2">
        <span class="shrink-0 text-muted-foreground">isBasedOn</span>
        <span class="min-w-0 flex-1 break-all font-mono">{{ entry.value }}</span>
        <Button size="sm" variant="ghost" :aria-label="`Remove ${entry.label}`" @click="removed.push(entry.value)">Remove</Button>
      </li>
      <li v-if="!entries.length" class="text-muted-foreground">Removed. The dataset will not point to the origin of this file.</li>
    </ul>
    <p class="text-muted-foreground">Added automatically when you add the file to a dataset. You can remove it there.</p>
  </div>
</template>
