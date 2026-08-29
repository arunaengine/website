<script setup lang="ts">
// A search box over a scrollable result list, driven from the keyboard: the
// arrows move over every `[role="option"]` in the list, Enter picks the active
// one. Hosts render the options; a dialog around it handles Escape.
import { nextTick, onMounted, onUpdated, ref, watch } from 'vue'
import Input from '@/components/ui/Input.vue'
import Spinner from '@/components/ui/Spinner.vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  ariaLabel?: string
  busy?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const list = ref<HTMLElement | null>(null)
const active = ref(0)

function options(): HTMLElement[] {
  return Array.from(list.value?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
}

function mark() {
  const found = options()
  if (active.value >= found.length) active.value = Math.max(0, found.length - 1)
  found.forEach((option, index) => {
    const current = index === active.value
    option.setAttribute('data-active', String(current))
    option.setAttribute('aria-selected', String(current))
  })
}

function move(delta: number) {
  const count = options().length
  if (!count) return
  active.value = Math.min(count - 1, Math.max(0, active.value + delta))
  mark()
  options()[active.value]?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    const option = options()[active.value]
    if (!option) return
    event.preventDefault()
    option.click()
  }
}

watch(() => props.modelValue, () => {
  active.value = 0
  void nextTick(mark)
})
onMounted(mark)
onUpdated(mark)
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <div class="relative border-b border-border px-3 py-2">
      <Input
        :model-value="modelValue"
        autofocus
        role="combobox"
        aria-autocomplete="list"
        :aria-label="ariaLabel ?? placeholder"
        :placeholder="placeholder"
        class="h-9 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
        @update:model-value="(value: string | number) => emit('update:modelValue', String(value))"
        @keydown="onKeydown"
      />
      <Spinner v-if="busy" class="absolute right-4 top-1/2 -translate-y-1/2" label="Searching" />
    </div>
    <div ref="list" role="listbox" class="scrollbar-thin max-h-[50vh] min-h-0 flex-1 overflow-y-auto p-2">
      <slot />
    </div>
    <div v-if="$slots.footer" class="border-t border-border px-3 py-2">
      <slot name="footer" />
    </div>
  </div>
</template>
