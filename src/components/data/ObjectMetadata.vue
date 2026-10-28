<script setup lang="ts">
// The metadata stored with a file or folder, such as the columns an import from a list kept.
// Keys the node uses for itself (aruna-*) stay hidden.
import { computed, ref } from 'vue'

const props = defineProps<{ metadata: Record<string, string> }>()

const SHOWN = 3
const all = ref(false)
const rows = computed(() => Object.entries(props.metadata).filter(([key]) => !key.startsWith('aruna-')).sort(([a], [b]) => a.localeCompare(b)))
const visible = computed(() => (all.value ? rows.value : rows.value.slice(0, SHOWN)))
</script>

<template>
  <section v-if="rows.length" class="rounded-md border border-border text-xs">
    <h3 class="border-b border-border px-3 py-2 font-medium text-foreground">Metadata</h3>
    <dl class="divide-y divide-border">
      <div v-for="[key, value] in visible" :key="key" class="grid grid-cols-[minmax(0,10rem)_1fr] gap-3 px-3 py-1.5">
        <dt class="truncate font-mono text-muted-foreground" :title="key">{{ key }}</dt>
        <dd class="break-words">{{ value }}</dd>
      </div>
    </dl>
    <button v-if="rows.length > SHOWN" type="button" class="px-3 py-1.5 text-primary hover:underline" @click="all = !all">
      {{ all ? 'Show less' : `Show all ${rows.length}` }}
    </button>
  </section>
</template>
