<script setup lang="ts">
// A value that can grow: one entry reads inline, more become a count with a
// show link, and the revealed list scrolls once it is long.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'

const props = withDefaults(
  defineProps<{ items: readonly string[]; noun: string; mono?: boolean }>(),
  { mono: false },
)

const open = ref(false)
const summary = computed(() => `${props.items.length} ${props.noun}${props.items.length === 1 ? '' : 's'}`)
const listClass = computed(() => (props.mono ? 'break-all font-mono text-xs' : 'text-xs'))
</script>

<template>
  <span v-if="items.length === 1" :class="listClass">{{ items[0] }}</span>
  <div v-else-if="items.length" class="space-y-1">
    <div class="flex flex-wrap items-center gap-2">
      <span>{{ summary }}</span>
      <Button variant="link" size="sm" class="h-auto px-0 text-xs" @click="open = !open">
        {{ open ? 'hide' : 'show' }}
      </Button>
    </div>
    <ul v-if="open" class="scrollbar-thin max-h-24 space-y-0.5 overflow-y-auto" :class="listClass">
      <li v-for="item in items" :key="item">{{ item }}</li>
    </ul>
  </div>
  <span v-else class="text-muted-foreground">none</span>
</template>
