<script setup lang="ts">
// One tool call the model made: what it asked for, what came back, and the
// approve or abort choice while it waits for one. The body folds away once
// the call is settled; a call still asking stays open.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import type { ToolCallView } from '@/lib/assistant/types'
import { Check, ChevronRight, Wrench, X } from '@lucide/vue'

const props = defineProps<{ call: ToolCallView; awaitingDelete?: boolean; collapsed?: boolean }>()
const emit = defineEmits<{ (e: 'decide', approved: boolean): void }>()

const STATE_VARIANT = {
  approval: 'warn',
  running: 'secondary',
  done: 'accent',
  error: 'destructive',
  denied: 'secondary',
} as const

const open = ref(!props.collapsed)
// A call that needs an answer opens itself, whatever the fold says.
watch(() => props.call.state, (state) => {
  if (state === 'approval') open.value = true
}, { immediate: true })

function preview(value: unknown): string {
  if (value === undefined) return ''
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return text.length > 2000 ? `${text.slice(0, 2000)}…` : text
}

const input = computed(() => preview(props.call.input))
const output = computed(() => preview(props.call.output))
const hasBody = computed(() =>
  (input.value && input.value !== '{}') || props.call.state === 'approval' || props.call.state === 'denied'
  || Boolean(props.call.error) || Boolean(output.value))
</script>

<template>
  <div class="rounded-md border border-border bg-muted/20 text-[11px]">
    <button
      type="button"
      class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      :class="open && hasBody ? 'border-b border-border/60' : ''"
      :aria-expanded="open"
      :disabled="!hasBody"
      @click="open = !open"
    >
      <ChevronRight :class="['h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && hasBody && 'rotate-90', !hasBody && 'invisible']" />
      <Wrench class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span class="min-w-0 truncate font-mono font-medium text-foreground">{{ call.name }}</span>
      <Badge size="sm" :variant="STATE_VARIANT[call.state]" class="ml-auto uppercase">{{ call.state }}</Badge>
    </button>
    <div v-if="open && hasBody" class="space-y-1.5 px-2.5 py-2">
      <pre v-if="input && input !== '{}'" class="scrollbar-thin max-h-32 overflow-auto font-mono text-[10px] text-muted-foreground">{{ input }}</pre>
      <div v-if="call.state === 'approval'" class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">
          {{ awaitingDelete ? 'Remove this entity from the draft?' : 'Run this tool?' }}
        </span>
        <Button size="sm" @click="emit('decide', true)">
          <Check class="size-3.5 shrink-0" aria-hidden="true" /> Approve
        </Button>
        <Button variant="ghost" size="sm" @click="emit('decide', false)">
          <X class="size-3.5 shrink-0" aria-hidden="true" /> Abort
        </Button>
      </div>
      <p v-else-if="call.state === 'denied'" class="text-muted-foreground">Aborted, nothing ran.</p>
      <p v-else-if="call.error" class="break-words text-destructive">{{ call.error }}</p>
      <pre v-else-if="output" class="scrollbar-thin max-h-40 overflow-auto font-mono text-[10px] text-foreground/80">{{ output }}</pre>
    </div>
  </div>
</template>
