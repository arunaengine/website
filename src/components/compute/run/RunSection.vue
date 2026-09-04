<script setup lang="ts">
// One card of the run page: title, the state of the section, its own controls
// and a completion check at the right end of the header row.
import { computed, useId } from 'vue'
import { Check } from '@lucide/vue'

const props = defineProps<{
  id: string
  title: string
  /** Green tick when the section is complete, amber "!" while it is not. */
  complete: boolean
  /** What the check says, read out by assistive technology. */
  checkLabel: string
}>()

const headingId = `${props.id}-heading`
const uid = useId()
const checkId = `check-${uid}`
const tone = computed(() =>
  props.complete
    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20'
    : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/20',
)
</script>

<template>
  <section :id="id" class="surface p-5" :aria-labelledby="headingId" :aria-describedby="checkId">
    <div class="flex items-center gap-2.5" :class="$slots.default ? 'mb-3.5' : ''">
      <h2 :id="headingId" class="shrink-0 font-display text-sm font-semibold text-aruna-navy">{{ title }}</h2>
      <p class="min-w-0 flex-1 truncate text-xs" :class="complete ? 'text-muted-foreground' : 'font-medium text-amber-700 dark:text-amber-300'">
        <slot name="state" />
      </p>
      <span v-if="$slots.controls" class="flex shrink-0 items-center gap-2"><slot name="controls" /></span>
      <span
        :id="checkId"
        role="img"
        :aria-label="checkLabel"
        :title="checkLabel"
        :class="['flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold', tone]"
      >
        <Check v-if="complete" class="size-3" :stroke-width="3" />
        <template v-else>!</template>
      </span>
    </div>
    <slot />
  </section>
</template>
