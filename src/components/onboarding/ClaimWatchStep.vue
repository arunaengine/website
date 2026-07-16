<script setup lang="ts">
// Reusable progress timeline (aruna#277). The stage list and all polling live
// in the caller (the onboarding view here; the device-enrollment flow in
// aruna#271), so this component stays free of onboarding copy and API calls.
// Terminal CTAs go in the #actions slot.
import { Check, Circle, LoaderCircle, X } from '@lucide/vue'

export interface WatchStage {
  key: string
  label: string
  state: 'pending' | 'active' | 'done' | 'failed'
  // e.g. a truncated claimed node id.
  detail?: string
}

defineProps<{ stages: WatchStage[]; error?: string | null }>()
</script>

<template>
  <div class="space-y-4">
    <ol class="space-y-3">
      <li v-for="stage in stages" :key="stage.key" class="flex items-start gap-3">
        <span
          :class="[
            'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full',
            stage.state === 'done'
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : stage.state === 'active'
                ? 'bg-primary/15 text-primary'
                : stage.state === 'failed'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-muted-foreground',
          ]"
        >
          <Check v-if="stage.state === 'done'" class="h-3.5 w-3.5" />
          <LoaderCircle v-else-if="stage.state === 'active'" class="h-3.5 w-3.5 animate-spin" />
          <X v-else-if="stage.state === 'failed'" class="h-3.5 w-3.5" />
          <Circle v-else class="h-2 w-2 fill-current" />
        </span>
        <div class="min-w-0 flex-1">
          <div
            :class="[
              'text-sm font-medium',
              stage.state === 'pending' ? 'text-muted-foreground' : 'text-foreground',
            ]"
          >
            {{ stage.label }}
          </div>
          <div v-if="stage.detail" class="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
            {{ stage.detail }}
          </div>
        </div>
      </li>
    </ol>
    <p
      v-if="error"
      class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300"
    >
      {{ error }}
    </p>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2"><slot name="actions" /></div>
  </div>
</template>
