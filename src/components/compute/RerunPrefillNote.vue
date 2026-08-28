<script setup lang="ts">
// Status of a ?rerun=<id> prefill, shared by both run wizards.
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'

defineProps<{
  loading: boolean
  error: string | null
  source: { id: string; name: string } | null
  notes: string[]
}>()
const emit = defineEmits<{ (e: 'dismiss'): void }>()
</script>

<template>
  <div v-if="loading" class="surface-inline px-4 py-3 text-xs text-muted-foreground">
    Loading the earlier run…
  </div>
  <Notice v-else-if="error" tone="error" class="flex flex-wrap items-center justify-between gap-2">
    <span>{{ error }}</span>
    <Button variant="ghost" size="sm" @click="emit('dismiss')">Dismiss</Button>
  </Notice>
  <div v-else-if="source" class="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-xs">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="font-medium text-foreground">
        Prefilled from run <span class="font-mono">{{ source.name }}</span>.
      </span>
      <Button variant="ghost" size="sm" @click="emit('dismiss')">Dismiss</Button>
    </div>
    <ul v-if="notes.length" class="list-disc space-y-0.5 pl-4 text-muted-foreground">
      <li v-for="note in notes" :key="note">{{ note }}</li>
    </ul>
  </div>
</template>
