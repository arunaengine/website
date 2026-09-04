<script setup lang="ts">
// One decision of the Resources or Placement card: its label, whether it is the
// default or a choice, and the value. Editing replaces the value in place.
defineProps<{ label: string; tag: string; value: string; sub?: string }>()
</script>

<template>
  <div class="surface-inline px-3 py-2.5">
    <dt class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {{ label }}
      <span
        class="rounded px-1.5 text-[9.5px] font-semibold uppercase leading-4 tracking-wide"
        :class="tag === 'default' ? 'bg-muted text-muted-foreground' : 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'"
      >{{ tag }}</span>
    </dt>
    <dd class="mt-1 min-w-0">
      <slot>
        <span class="block min-h-8 truncate font-display text-[15px] font-semibold leading-8 text-aruna-navy" :title="value">
          {{ value }}
        </span>
        <span v-if="sub" class="block truncate text-[11px] text-muted-foreground" :title="sub">{{ sub }}</span>
      </slot>
    </dd>
  </div>
</template>
