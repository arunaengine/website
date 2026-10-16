<script setup lang="ts">
// Node choice of the bucket list: All nodes or one node. The home node comes
// first, then recently used nodes, then the rest by name.
import Input from '@/components/ui/Input.vue'
import Popover from '@/components/ui/Popover.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { useRealmNodes, type RealmNodeDisplay } from '@/composables/useRealmNodes'
import { Check, ChevronDown } from '@lucide/vue'
import { computed, ref } from 'vue'

const props = defineProps<{
  /** Null: all nodes. */
  modelValue: string | null
  /** Node ids, most recently used first. */
  recent?: string[]
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string | null): void }>()

const { nodes, displayName, nodeById } = useRealmNodes()
const open = ref(false)
const filter = ref('')
// A short list needs no filter field.
const FILTER_FROM = 8

const ordered = computed(() => {
  const recent = props.recent ?? []
  const rank = (node: RealmNodeDisplay) => {
    if (node.isLocal) return -1
    const index = recent.indexOf(node.nodeId)
    return index < 0 ? recent.length : index
  }
  return [...nodes.value].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
})
const shown = computed(() => {
  const term = filter.value.trim().toLowerCase()
  if (!term) return ordered.value
  return ordered.value.filter(
    (node) => node.label.toLowerCase().includes(term) || node.nodeId.toLowerCase().startsWith(term),
  )
})
const selected = computed(() => (props.modelValue ? nodeById(props.modelValue) : null))

function choose(nodeId: string | null) {
  emit('update:modelValue', nodeId)
  open.value = false
  filter.value = ''
}
</script>

<template>
  <Popover v-model:open="open">
    <button
      type="button"
      class="flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-field px-2 text-xs text-foreground"
      aria-label="Node"
    >
      <StatusDot
        v-if="selected"
        :tone="selected.reachable ? 'done' : 'idle'"
        :label="selected.reachable ? 'Reachable' : 'Not reachable'"
      />
      <span class="min-w-0 flex-1 truncate text-left">{{ modelValue ? displayName(modelValue) : 'All nodes' }}</span>
      <ChevronDown class="h-3.5 w-3.5 shrink-0 opacity-60" />
    </button>
    <template #content>
      <Input
        v-if="nodes.length >= FILTER_FROM"
        v-model="filter"
        placeholder="Find a node"
        aria-label="Find a node"
        class="mb-2 h-8 text-xs"
      />
      <ul class="max-h-72 space-y-0.5 overflow-y-auto">
        <li v-if="!filter.trim()">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
            @click="choose(null)"
          >
            <span class="flex-1">All nodes</span>
            <Check v-if="!modelValue" class="h-3.5 w-3.5 text-primary" />
          </button>
        </li>
        <li v-for="node in shown" :key="node.nodeId">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
            :title="node.nodeId"
            @click="choose(node.nodeId)"
          >
            <StatusDot :tone="node.reachable ? 'done' : 'idle'" :label="node.reachable ? 'Reachable' : 'Not reachable'" />
            <span class="min-w-0 flex-1 truncate">{{ node.label }}</span>
            <span v-if="node.isLocal" class="shrink-0 text-muted-foreground">home</span>
            <span v-else-if="!node.reachable" class="shrink-0 text-muted-foreground">not reachable</span>
            <Check v-if="modelValue === node.nodeId" class="h-3.5 w-3.5 shrink-0 text-primary" />
          </button>
        </li>
      </ul>
      <p v-if="!shown.length" class="px-2 py-1.5 text-xs text-muted-foreground">No node matches.</p>
    </template>
  </Popover>
</template>
