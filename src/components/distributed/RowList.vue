<script setup lang="ts">
// Label-value rows in the style of the file details. A named slot per key replaces the value.
export interface Row {
  key?: string
  label: string
  value: string
  mono?: boolean
}

defineProps<{ rows: readonly Row[] }>()
</script>

<template>
  <dl class="space-y-2 text-xs">
    <div v-for="row in rows" :key="row.key ?? row.label" class="flex items-baseline justify-between gap-4">
      <dt class="shrink-0 text-muted-foreground">{{ row.label }}</dt>
      <dd :class="['min-w-0 break-all text-right text-foreground', row.mono ? 'font-mono' : '']">
        <slot :name="row.key ?? row.label" :row="row">{{ row.value }}</slot>
      </dd>
    </div>
  </dl>
</template>
