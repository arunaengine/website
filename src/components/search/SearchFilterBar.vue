<script lang="ts">
import type { Component } from 'vue'

export interface FacetOption {
  value: string
  label: string
}

// One filter is described by one config entry. A new facet is added by pushing
// another entry, never by editing this template:
//   - single select: { key, label, options }
//   - multi select  : { key, label, options, multi: true }
//   - toggle        : { key, label, toggle: true }
// `icon` is an optional lucide component shown inside toggle/multi controls.
export interface Facet {
  key: string
  label: string
  options?: FacetOption[]
  multi?: boolean
  toggle?: boolean
  icon?: Component
}

export type FacetValue = string | string[] | boolean | null
export type FilterModel = Record<string, FacetValue>
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'radix-vue'
import Select from '@/components/ui/Select.vue'
import { Check, ChevronDown, Filter, X } from '@lucide/vue'

const props = defineProps<{
  facets: Facet[]
  modelValue: FilterModel
  ariaLabel?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: FilterModel): void }>()

// radix Select items cannot carry an empty-string value, so the "no filter"
// option rides a sentinel that maps to/from a cleared (null) facet value.
const ANY = '__any__'

// Every control shares one surface recipe so the whole row reads as one system
// and lines up with the search input above it. `bg-background` (not `bg-field`)
// is deliberate: it keeps the controls visible against the white `.surface`
// card in the light theme, where `--field` and `--card` are both pure white.
const CONTROL =
  'inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-xs font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring'
const CONTROL_IDLE = 'border-input bg-background text-foreground'
const CONTROL_TOGGLE_IDLE = 'border-input bg-background text-muted-foreground hover:text-foreground'
const SELECT_CLASS = 'h-10 w-auto min-w-[8.5rem] max-w-[14rem] bg-background text-xs font-medium'

function optionLabel(facet: Facet, value: string): string {
  return facet.options?.find((option) => option.value === value)?.label ?? value
}

function selectOptions(facet: Facet): FacetOption[] {
  return [{ value: ANY, label: 'All' }, ...(facet.options ?? [])]
}
function selectModel(facet: Facet): string {
  const value = props.modelValue[facet.key]
  return typeof value === 'string' && value ? value : ANY
}
function setSelect(facet: Facet, value: string) {
  patch(facet.key, value === ANY ? null : value)
}

function multiValues(facet: Facet): string[] {
  const value = props.modelValue[facet.key]
  return Array.isArray(value) ? value : []
}
function multiSummary(facet: Facet): string {
  const count = multiValues(facet).length
  return count ? `${count} selected` : 'All'
}
function toggleMulti(facet: Facet, value: string) {
  const current = multiValues(facet)
  patch(facet.key, current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value])
}

function isToggled(facet: Facet): boolean {
  return props.modelValue[facet.key] === true
}

function patch(key: string, value: FacetValue) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
function clearedValue(facet: Facet): FacetValue {
  return facet.toggle ? false : facet.multi ? [] : null
}

// Active-filter summary: one removable chip per engaged facet plus a single
// reset, so the current narrowing stays legible even when the controls wrap.
const chips = computed<Array<{ key: string; label: string }>>(() => {
  const out: Array<{ key: string; label: string }> = []
  for (const facet of props.facets) {
    const value = props.modelValue[facet.key]
    if (facet.toggle) {
      if (value === true) out.push({ key: facet.key, label: facet.label })
    } else if (facet.multi) {
      const values = Array.isArray(value) ? value : []
      if (values.length) {
        out.push({ key: facet.key, label: `${facet.label}: ${values.map((entry) => optionLabel(facet, entry)).join(', ')}` })
      }
    } else if (typeof value === 'string' && value) {
      out.push({ key: facet.key, label: `${facet.label}: ${optionLabel(facet, value)}` })
    }
  }
  return out
})
const hasActive = computed(() => chips.value.length > 0)

function removeChip(key: string) {
  const facet = props.facets.find((entry) => entry.key === key)
  if (facet) patch(key, clearedValue(facet))
}
function resetAll() {
  const next: FilterModel = { ...props.modelValue }
  for (const facet of props.facets) next[facet.key] = clearedValue(facet)
  emit('update:modelValue', next)
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-2" role="group" :aria-label="ariaLabel ?? 'Filters'">
      <span class="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground sm:inline-flex">
        <Filter class="h-3.5 w-3.5" /> Filter
      </span>

      <template v-for="facet in facets" :key="facet.key">
        <!-- Multi select: a popover of checkboxes keeps every option in reach
             without a right-side drawer and stays open across picks. -->
        <PopoverRoot v-if="facet.multi">
          <PopoverTrigger
            :class="[CONTROL, CONTROL_IDLE, 'w-auto min-w-[8.5rem] max-w-[14rem] justify-between']"
            :aria-label="`Filter by ${facet.label}`"
          >
            <span class="flex min-w-0 items-center gap-1.5">
              <component :is="facet.icon" v-if="facet.icon" class="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span class="shrink-0 text-muted-foreground">{{ facet.label }}:</span>
              <span class="truncate">{{ multiSummary(facet) }}</span>
            </span>
            <ChevronDown class="h-4 w-4 shrink-0 opacity-60" />
          </PopoverTrigger>
          <PopoverPortal>
            <PopoverContent
              align="start"
              :side-offset="4"
              class="z-50 max-h-80 w-56 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
            >
              <button
                v-for="option in facet.options ?? []"
                :key="option.value"
                type="button"
                role="menuitemcheckbox"
                :aria-checked="multiValues(facet).includes(option.value)"
                class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
                @click="toggleMulti(facet, option.value)"
              >
                <span
                  class="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                  :class="multiValues(facet).includes(option.value) ? 'border-primary bg-primary text-primary-foreground' : 'border-input'"
                >
                  <Check v-if="multiValues(facet).includes(option.value)" class="h-3 w-3" />
                </span>
                <span class="truncate">{{ option.label }}</span>
              </button>
            </PopoverContent>
          </PopoverPortal>
        </PopoverRoot>

        <!-- Toggle: a boolean facet with no options (e.g. favourites). -->
        <button
          v-else-if="facet.toggle"
          type="button"
          :aria-pressed="isToggled(facet)"
          :class="[CONTROL, isToggled(facet) ? 'border-primary/50 bg-primary/10 text-primary' : CONTROL_TOGGLE_IDLE]"
          @click="patch(facet.key, !isToggled(facet))"
        >
          <component :is="facet.icon" v-if="facet.icon" class="h-3.5 w-3.5" :fill="isToggled(facet) ? 'currentColor' : 'none'" />
          {{ facet.label }}
        </button>

        <!-- Single select: reuse the shared ui/Select trigger and popover. -->
        <Select
          v-else
          :model-value="selectModel(facet)"
          :options="selectOptions(facet)"
          :label="facet.label"
          :aria-label="`Filter by ${facet.label}`"
          :class="SELECT_CLASS"
          @update:model-value="(value: string) => setSelect(facet, value)"
        />
      </template>
    </div>

    <!-- Active-filter chips plus a single reset, underneath the control row. -->
    <div v-if="hasActive" class="mt-2.5 flex flex-wrap items-center gap-1.5">
      <span
        v-for="chip in chips"
        :key="chip.key"
        class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pl-2.5 pr-1 text-[11px] text-foreground"
      >
        {{ chip.label }}
        <button
          type="button"
          class="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          :aria-label="`Remove ${chip.label} filter`"
          @click="removeChip(chip.key)"
        >
          <X class="h-3 w-3" />
        </button>
      </span>
      <button
        type="button"
        class="ml-1 text-[11px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        @click="resetAll"
      >
        Reset all
      </button>
    </div>
  </div>
</template>
