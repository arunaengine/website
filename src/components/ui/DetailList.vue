<script setup lang="ts">
// Label/value plates. A named slot per item key overrides the plain value.
export interface Detail {
  key?: string
  label: string
  value: string
  mono?: boolean
}

withDefaults(defineProps<{ items: readonly Detail[]; class?: string }>(), { class: undefined })
</script>

<template>
  <dl :class="['grid gap-3 sm:grid-cols-2', $props.class]">
    <div v-for="item in items" :key="item.key ?? item.label" class="surface-inline px-3 py-2">
      <dt class="text-[11px] uppercase tracking-wide text-muted-foreground">{{ item.label }}</dt>
      <dd :class="['mt-0.5 text-sm text-foreground', item.mono ? 'break-all font-mono text-xs' : '']">
        <slot :name="item.key ?? item.label" :item="item">{{ item.value }}</slot>
      </dd>
    </div>
  </dl>
</template>
