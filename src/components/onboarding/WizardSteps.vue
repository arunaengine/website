<script setup lang="ts">
// Reusable stepper header (aruna#277). Purely presentational and data-driven:
// pass any step labels and the 0-based current index. The device-enrollment
// flow (aruna#271) reuses it as-is with its own labels, so keep it free of
// onboarding-specific copy.
import { Check } from '@lucide/vue'

defineProps<{ steps: string[]; current: number }>()
</script>

<template>
  <ol class="flex items-center gap-2" aria-label="Progress">
    <li
      v-for="(label, index) in steps"
      :key="index"
      class="flex flex-1 items-center gap-2 last:flex-none"
      :aria-current="index === current ? 'step' : undefined"
    >
      <div class="flex items-center gap-2">
        <span
          :class="[
            'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors',
            index < current
              ? 'bg-primary text-primary-foreground'
              : index === current
                ? 'bg-primary/15 text-primary ring-2 ring-inset ring-primary/40'
                : 'bg-muted text-muted-foreground',
          ]"
        >
          <Check v-if="index < current" class="h-3.5 w-3.5" />
          <template v-else>{{ index + 1 }}</template>
        </span>
        <span
          :class="[
            'whitespace-nowrap text-xs font-medium',
            index === current ? 'text-foreground' : 'text-muted-foreground',
          ]"
        >
          {{ label }}
        </span>
      </div>
      <span
        v-if="index < steps.length - 1"
        :class="['hidden h-px flex-1 sm:block', index < current ? 'bg-primary/50' : 'bg-border']"
        aria-hidden="true"
      />
    </li>
  </ol>
</template>
