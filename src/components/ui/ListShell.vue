<script setup lang="ts">
// The one list surface: an optional toolbar, skeleton rows while loading, the
// load failure with its retry, the empty state, the rows and an optional
// footer, all inside a single card.
import ListSkeleton from '@/components/ui/ListSkeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

withDefaults(
  defineProps<{
    state: 'loading' | 'error' | 'empty' | 'ready'
    error?: string
    emptyTitle?: string
    emptyDescription?: string
    compact?: boolean
    rows?: number
  }>(),
  {
    error: undefined,
    emptyTitle: 'Nothing here yet',
    emptyDescription: undefined,
    compact: false,
    rows: 5,
  },
)
defineEmits<{ (e: 'retry'): void }>()
</script>

<template>
  <ErrorPanel
    v-if="state === 'error'"
    :message="error || 'This list could not be loaded.'"
    @retry="$emit('retry')"
  />

  <EmptyState
    v-else-if="state === 'empty'"
    :compact="compact"
    :title="emptyTitle"
    :description="emptyDescription"
  >
    <template v-if="$slots.icon" #icon><slot name="icon" /></template>
    <slot v-if="$slots['empty-actions']" name="empty-actions" />
  </EmptyState>

  <div v-else class="surface overflow-hidden">
    <div
      v-if="state === 'ready' && ($slots.filters || $slots.tools)"
      class="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-2"
    >
      <slot name="filters" />
      <div v-if="$slots.tools" class="ml-auto flex items-center gap-2"><slot name="tools" /></div>
    </div>

    <ListSkeleton v-if="state === 'loading'" bare :rows="rows" />
    <slot v-else />

    <div v-if="state === 'ready' && $slots.footer" class="border-t border-border px-5 py-2">
      <slot name="footer" />
    </div>
  </div>
</template>
