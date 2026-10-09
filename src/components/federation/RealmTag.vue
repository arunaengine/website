<script setup lang="ts">
// A realm by name with the start of its id, so equal names stay distinguishable.
import { computed } from 'vue'
import { colorFor, shortId } from '@/composables/aruna/format'

const props = defineProps<{ realmId: string; name?: string }>()
const color = computed(() => colorFor(props.realmId))
</script>

<template>
  <span
    class="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border bg-card/80 px-2 py-0.5 text-[11px] font-medium text-foreground/90"
    :style="{ borderColor: `${color}66` }"
    :title="`Realm ${realmId}`"
  >
    <span class="h-1.5 w-1.5 shrink-0 rounded-full" :style="{ backgroundColor: color }" aria-hidden="true" />
    <span class="truncate">{{ name || 'Unknown realm' }}</span>
    <span class="font-mono text-[10px] font-normal text-muted-foreground">{{ shortId(realmId) }}</span>
  </span>
</template>
