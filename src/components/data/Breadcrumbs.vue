<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, Home } from '@lucide/vue'

const props = defineProps<{ path: string; bucket: string }>()
const emit = defineEmits<{
  (e: 'navigate', path: string): void
}>()

const parts = computed(() => (props.path ? props.path.split('/') : []))
</script>

<template>
  <nav class="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground">
    <button
      class="inline-flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
      :title="bucket"
      @click="emit('navigate', '')"
    >
      <Home class="h-3.5 w-3.5 shrink-0" />
      <span class="truncate font-medium">{{ bucket }}</span>
    </button>
    <template v-for="(p, idx) in parts" :key="idx">
      <ChevronRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      <button
        class="truncate rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
        :class="idx === parts.length - 1 ? 'font-medium text-foreground' : ''"
        :title="p"
        @click="emit('navigate', parts.slice(0, idx + 1).join('/'))"
      >
        {{ p }}
      </button>
    </template>
  </nav>
</template>
