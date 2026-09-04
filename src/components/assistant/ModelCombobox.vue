<script setup lang="ts">
// A model id field: free text, with every id the provider is known to offer
// listed on request. Typing only fills a draft; the id reaches the parent when
// it is picked, entered, or the field is left with a changed valid id.
import { computed, ref, watch } from 'vue'
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
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  /** The text in the field, so the parent can offer to save it. */
  (e: 'update:draft', value: string): void
}>()

const open = ref(false)
const active = ref(-1)
// Only text typed since the field was opened narrows the list; the selected id
// sitting in the field is not a search, or it would hide every other model.
const query = ref<string | null>(null)
const draft = ref(props.modelValue)

watch(() => props.modelValue, (value) => {
  draft.value = value
})
watch(draft, (value) => emit('update:draft', value))

const shown = computed(() => {
  const needle = (query.value ?? '').trim().toLowerCase()
  if (!needle) return props.suggestions
  return props.suggestions.filter((model) =>
    `${model.id} ${model.display_name ?? ''}`.toLowerCase().includes(needle))
})
const listOpen = computed(() => open.value && shown.value.length > 0)
const invalid = computed(() => props.required && !isValidModelId(draft.value))
const changed = computed(() =>
  isValidModelId(draft.value) && normalizeModelId(draft.value) !== normalizeModelId(props.modelValue))

function close() {
  open.value = false
  active.value = -1
  query.value = null
}

function apply(value: string) {
  const id = normalizeModelId(value)
  draft.value = id
  if (id && id !== normalizeModelId(props.modelValue)) emit('update:modelValue', id)
}

function choose(index: number) {
  const model = shown.value[index]
  if (!model) return
  apply(model.id)
  close()
}

function onInput(value: string | number) {
  const text = String(value)
  draft.value = text
  query.value = text
  open.value = true
  active.value = -1
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    draft.value = props.modelValue
    close()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    if (open.value && active.value >= 0) choose(active.value)
    else {
      apply(draft.value)
      close()
    }
    return
  }
  if (!shown.value.length) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    open.value = true
    active.value = (active.value + 1) % shown.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    open.value = true
    active.value = (active.value - 1 + shown.value.length) % shown.value.length
  }
}

// The list stays closed until it is asked for: a click, a key, or typing.
function onFocus() {
  query.value = null
}

function onBlur() {
  close()
  if (changed.value) apply(draft.value)
  else draft.value = normalizeModelId(props.modelValue)
}
</script>

<template>
  <div :class="cn('min-w-0', props.class)">
    <PopoverRoot :open="listOpen">
      <PopoverAnchor as="div" class="h-full">
        <Input
          :model-value="draft"
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
          @click="open = true"
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
