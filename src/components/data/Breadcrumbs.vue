<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, FolderOpenDot, Home } from 'lucide-vue-next'

const props = defineProps<{ path: string; bucket: string }>()
const emit = defineEmits<{
  (e: 'navigate', path: string): void
}>()

const parts = computed(() => (props.path ? props.path.split('/') : []))
</script>

<template>
  <nav class="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
    <button
      class="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
      @click="emit('navigate', '')"
    >
      <Home class="h-3.5 w-3.5" />
      <span class="font-medium">{{ bucket }}</span>
    </button>
    <template v-for="(p, idx) in parts" :key="idx">
      <ChevronRight class="h-3.5 w-3.5 text-muted-foreground/60" />
      <button
        class="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
        :class="idx === parts.length - 1 ? 'font-medium text-foreground' : ''"
        @click="emit('navigate', parts.slice(0, idx + 1).join('/'))"
      >
        {{ p }}
      </button>
    </template>
    <span v-if="!parts.length" class="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground/70">
      <FolderOpenDot class="h-3 w-3" /> root
    </span>
  </nav>
</template>
