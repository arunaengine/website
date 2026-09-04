<script setup lang="ts">
// The paths a command line or a script text names, each with what covers it.
// An unassigned path carries the one action that would cover it.
import type { RunPathCheck } from '@/lib/runPaths'

defineProps<{ label: string; checks: RunPathCheck[]; canMountScript?: boolean }>()
const emit = defineEmits<{
  (e: 'capture', path: string): void
  (e: 'add-input', path: string): void
  (e: 'mount-script', path: string): void
}>()

const KIND_CLASS: Record<string, string> = {
  script: 'bg-muted text-foreground',
  input: 'bg-aruna-sky/10 text-sky-700 dark:text-aruna-aqua',
  'input-folder': 'bg-aruna-sky/10 text-sky-700 dark:text-aruna-aqua',
  captured: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
  'captured-folder': 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
  'missing-input': 'bg-destructive/10 text-destructive',
  'missing-capture': 'bg-destructive/10 text-destructive',
}
</script>

<template>
  <div v-if="checks.length" class="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
    <span>{{ label }}</span>
    <span
      v-for="check in checks"
      :key="check.path"
      :class="[
        'inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-2 pr-1 font-mono text-[11px] text-foreground',
        check.fix ? 'border-destructive bg-destructive/5' : 'border-border bg-card',
      ]"
    >
      <span class="max-w-56 truncate" :title="check.path">{{ check.path }}</span>
      <span :class="['rounded-full px-1.5 py-px font-sans text-[10px] font-semibold uppercase tracking-wide', KIND_CLASS[check.kind]]">
        {{ check.label }}
      </span>
      <button
        v-if="check.fix === 'capture'"
        type="button"
        class="rounded-full bg-accent px-2 py-px font-sans text-[10px] font-semibold text-accent-foreground hover:bg-accent/80"
        @click="emit('capture', check.path)"
      >
        Capture
      </button>
      <button
        v-else-if="check.fix === 'input'"
        type="button"
        class="rounded-full bg-accent px-2 py-px font-sans text-[10px] font-semibold text-accent-foreground hover:bg-accent/80"
        @click="emit('add-input', check.path)"
      >
        Add input
      </button>
      <button
        v-if="check.fix && canMountScript && !check.path.endsWith('/')"
        type="button"
        class="rounded-full bg-accent px-2 py-px font-sans text-[10px] font-semibold text-accent-foreground hover:bg-accent/80"
        @click="emit('mount-script', check.path)"
      >
        Mount script here
      </button>
    </span>
  </div>
</template>
