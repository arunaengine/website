<script setup lang="ts">
import Select from '@/components/ui/Select.vue'
import { computed } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { tenantClasses } from '@/lib/storage'
import type { GroupBackendResponse, RoutingTarget } from '@/lib/api'

const props = withDefaults(
  defineProps<{
    modelValue: RoutingTarget | null
    backends: GroupBackendResponse[]
    /** Offer the empty target, i.e. leave the choice to this node. */
    allowDefault?: boolean
    ariaLabel?: string
  }>(),
  { allowDefault: false, ariaLabel: 'Routing target' },
)
const emit = defineEmits<{ (e: 'update:modelValue', v: RoutingTarget | null): void }>()

const { nodeInfo } = useAruna()

// Radix rejects an empty option value, so the empty target has a sentinel.
const DEFAULT_VALUE = 'node-default'

const current = computed(() => {
  const target = props.modelValue
  if (target?.backend_id) return `backend:${target.backend_id}`
  if (target?.class) return `class:${target.class}`
  return DEFAULT_VALUE
})

const options = computed(() => {
  const list: { value: string; label: string }[] = []
  if (props.allowDefault) list.push({ value: DEFAULT_VALUE, label: 'Node default' })
  for (const backend of props.backends) {
    const value = `backend:${backend.backend_id}`
    // A disabled backend refuses new uploads; keep it listed only while stored.
    if (backend.disabled && current.value !== value) continue
    list.push({ value, label: backend.disabled ? `${backend.name} (disabled)` : backend.name })
  }
  for (const name of tenantClasses(nodeInfo?.value?.services.blob?.backends)) {
    list.push({ value: `class:${name}`, label: `Class ${name}` })
  }
  // A stored target naming a backend this group no longer lists must stay
  // visible rather than silently reading as something else.
  if (current.value !== DEFAULT_VALUE && !list.some((option) => option.value === current.value)) {
    list.push({ value: current.value, label: 'Backend that no longer exists' })
  }
  return list
})

function select(value: string) {
  if (value === DEFAULT_VALUE) emit('update:modelValue', null)
  else if (value.startsWith('backend:')) emit('update:modelValue', { backend_id: value.slice(8) })
  else emit('update:modelValue', { class: value.slice(6) })
}
</script>

<template>
  <Select
    :model-value="current"
    :options="options"
    :aria-label="props.ariaLabel"
    placeholder="Pick a target"
    @update:model-value="select"
  />
</template>
