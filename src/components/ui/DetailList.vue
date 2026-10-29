<script setup lang="ts">
// Label and value pairs: a 12 px label above its value, no box around each. `mono` is for ids,
// hashes, keys, commands, digests and addresses; plain values stay in the text face. A named
// slot per item key overrides the plain value.
export interface Detail {
  key?: string
  label: string
  value: string
  mono?: boolean
}

withDefaults(defineProps<{ items: readonly Detail[]; class?: string }>(), { class: undefined })
</script>

<template>
  <dl :class="['grid gap-x-6 gap-y-4 sm:grid-cols-2', $props.class]">
    <div v-for="item in items" :key="item.key ?? item.label" class="min-w-0">
      <dt class="type-label">{{ item.label }}</dt>
      <dd :class="['mt-1 text-sm leading-5 text-foreground', item.mono ? 'break-all font-mono text-[12.5px]' : 'break-words']">
        <slot :name="item.key ?? item.label" :item="item">{{ item.value }}</slot>
      </dd>
    </div>
  </dl>
</template>
