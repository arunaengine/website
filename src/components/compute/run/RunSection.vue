<script setup lang="ts">
// One section of the run page: a heading with its icon, a completion mark, the state of the
// section and its own controls above the card that holds it.
import { useId, type Component } from 'vue'
import { CircleCheck, CircleDashed } from '@lucide/vue'

const props = defineProps<{
  id: string
  title: string
  icon?: Component
  /** A green check when the section is complete, a dashed amber circle while it is not. */
  complete: boolean
  /** What the check says, read out by assistive technology. */
  checkLabel: string
}>()

const headingId = `${props.id}-heading`
const uid = useId()
const checkId = `check-${uid}`
</script>

<template>
  <section :id="id" class="scroll-mt-20" :aria-labelledby="headingId" :aria-describedby="checkId">
    <div class="mb-4 flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <component :is="icon" v-if="icon" class="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
        <h2 :id="headingId" class="type-section-title shrink-0">{{ title }}</h2>
        <span :id="checkId" role="img" :aria-label="checkLabel" :title="checkLabel" class="inline-flex shrink-0">
          <CircleCheck v-if="complete" class="size-4 text-status-ok" aria-hidden="true" />
          <CircleDashed v-else class="size-4 text-status-warn" aria-hidden="true" />
        </span>
        <p class="min-w-0 flex-1 truncate text-xs" :class="complete ? 'text-muted-foreground' : 'font-medium text-status-warn'">
          <slot name="state" />
        </p>
      </div>
      <div v-if="$slots.controls" class="flex shrink-0 flex-wrap items-center gap-2"><slot name="controls" /></div>
    </div>
    <div v-if="$slots.default" class="surface p-5"><slot /></div>
  </section>
</template>
