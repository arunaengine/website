<script setup lang="ts">
// A model id field: free text, with every id the provider is known to offer
// listed underneath. Any non-empty id is a valid choice.
import { computed, ref } from 'vue'
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from 'radix-vue'
import Input from '@/components/ui/Input.vue'
import type { AssistantModel } from '@/lib/api'
import { isValidModelId, normalizeModelId } from '@/lib/assistant/modelOptions'
import { cn } from '@/lib/utils'

const props = defineProps<{
  modelValue: string
  suggestions: AssistantModel[]
  placeholder?: string
  ariaLabel?: string
  class?: string
  /** An empty id is reported as invalid; leave unset where no model is fine. */
  required?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const open = ref(false)
const active = ref(-1)
// Only text typed since the field was opened narrows the list; the selected id
// sitting in the field is not a search, or it would hide every other model.
const query = ref<string | null>(null)

const shown = computed(() => {
  const needle = (query.value ?? '').trim().toLowerCase()
  if (!needle) return props.suggestions
  return props.suggestions.filter((model) =>
    `${model.id} ${model.display_name ?? ''}`.toLowerCase().includes(needle))
})
const listOpen = computed(() => open.value && shown.value.length > 0)
const invalid = computed(() => props.required && !isValidModelId(props.modelValue))

function close() {
  open.value = false
  active.value = -1
  query.value = null
}

function choose(index: number) {
  const model = shown.value[index]
  if (!model) return
  emit('update:modelValue', model.id)
  close()
}

function onInput(value: string | number) {
  const text = String(value)
  emit('update:modelValue', text)
  query.value = text
  open.value = true
  active.value = -1
}

function onKeydown(event: KeyboardEvent) {
  if (!shown.value.length) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    open.value = true
    active.value = (active.value + 1) % shown.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    open.value = true
    active.value = (active.value - 1 + shown.value.length) % shown.value.length
  } else if (event.key === 'Enter' && open.value && active.value >= 0) {
    event.preventDefault()
    choose(active.value)
  } else if (event.key === 'Escape') {
    close()
  }
}

function onFocus() {
  open.value = true
  query.value = null
}

function onBlur() {
  close()
  emit('update:modelValue', normalizeModelId(props.modelValue))
}
</script>

<template>
  <div :class="cn('min-w-0', props.class)">
    <PopoverRoot :open="listOpen">
      <PopoverAnchor as="div" class="h-full">
        <Input
          :model-value="modelValue"
          :placeholder="placeholder ?? 'Model id'"
          :aria-label="ariaLabel ?? 'Model'"
          :invalid="invalid ? 'error' : undefined"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="listOpen"
          class="h-full font-mono text-xs"
          autocomplete="off"
          spellcheck="false"
          @update:model-value="onInput"
          @focus="onFocus"
          @blur="onBlur"
          @keydown="onKeydown"
        />
      </PopoverAnchor>
      <!-- Portaled so the list floats over a dialog instead of growing its scroll area. -->
      <PopoverPortal>
        <PopoverContent
          side="bottom"
          align="start"
          :side-offset="4"
          data-portal-list
          class="z-50 w-[var(--radix-popover-trigger-width)] outline-none"
          @open-auto-focus.prevent
          @close-auto-focus.prevent
        >
          <ul
            role="listbox"
            aria-label="Suggested models"
            class="scrollbar-thin max-h-[min(18rem,var(--radix-popover-content-available-height,18rem))] overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md"
          >
            <li v-for="(model, index) in shown" :key="model.id">
              <!-- mousedown.prevent keeps the input focused so the click still lands. -->
              <button
                type="button"
                role="option"
                :aria-selected="index === active"
                class="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-xs"
                :class="index === active ? 'bg-muted' : 'hover:bg-muted/40'"
                @mousedown.prevent
                @click="choose(index)"
              >
                <span class="font-mono text-foreground">{{ model.id }}</span>
                <span v-if="model.display_name && model.display_name !== model.id" class="truncate text-muted-foreground">
                  {{ model.display_name }}
                </span>
              </button>
            </li>
          </ul>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </div>
</template>
