<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { truncateMiddle } from '@/lib/utils'
import { Plus, X } from '@lucide/vue'

const NODE_LABEL_KEY = 'aruna-engine.org/node'
const SYSTEM_LABEL_PREFIX = 'aruna-engine.org/'
const ANY_NODE_VALUE = '__any_node__'
const MAX_LABEL_CONSTRAINTS = 8

const props = defineProps<{ modelValue: Record<string, string> }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: Record<string, string>): void }>()

const { nodes } = useRealmNodes()
const { error: realmError, loadInfo } = useAruna()

// Two pickers can share a page, so every id this component emits is its own.
const uid = useId()
const labelKeysId = `placement-label-keys-${uid}`
const labelValuesId = (rowId: number) => `placement-label-values-${uid}-${rowId}`

// The node list comes from the realm document; without it there is nothing to
// pick from, so the failure is shown here rather than an empty dropdown.
const nodesUnavailable = computed(() => Boolean(realmError.value) && !nodes.value.length)
const retrying = ref(false)
async function retryNodes() {
  retrying.value = true
  try {
    await loadInfo()
  } catch {
    // loadInfo reports through the shared error ref.
  } finally {
    retrying.value = false
  }
}

interface ConstraintRow {
  id: number
  key: string
  value: string
}

let nextRowId = 0
const selectedNodeId = ref('')
const rows = ref<ConstraintRow[]>([])

function draftLabels(): Record<string, string> {
  const labels: Record<string, string> = {}
  if (selectedNodeId.value) labels[NODE_LABEL_KEY] = selectedNodeId.value
  for (const row of rows.value) {
    const key = row.key.trim()
    if (key) labels[key] = row.value.trim()
  }
  return labels
}

function labelsEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftEntries = Object.entries(left)
  const rightEntries = Object.entries(right)
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([key, value]) => right[key] === value)
}

watch(
  () => props.modelValue,
  (labels) => {
    if (labelsEqual(labels, draftLabels())) return
    selectedNodeId.value = labels[NODE_LABEL_KEY] ?? ''
    rows.value = Object.entries(labels)
      .filter(([key]) => key !== NODE_LABEL_KEY)
      .map(([key, value]) => ({ id: nextRowId++, key, value }))
  },
  { deep: true, immediate: true },
)

function updateModel() {
  emit('update:modelValue', draftLabels())
}

const nodeSelection = computed({
  get: () => selectedNodeId.value || ANY_NODE_VALUE,
  set: (value: string) => {
    if (
      value !== ANY_NODE_VALUE
      && !selectedNodeId.value
      && rows.value.length >= MAX_LABEL_CONSTRAINTS
    ) return
    selectedNodeId.value = value === ANY_NODE_VALUE ? '' : value
    updateModel()
  },
})

const eligibleNodes = computed(() =>
  nodes.value.filter((node) => node.executorKinds.length > 0),
)

const nodeOptions = computed(() => {
  const labelCounts = new Map<string, number>()
  for (const node of eligibleNodes.value) {
    labelCounts.set(node.label, (labelCounts.get(node.label) ?? 0) + 1)
  }
  const options = [
    { value: ANY_NODE_VALUE, label: 'Any node' },
    // An option label is plain text, so only a shared display name needs the id.
    ...eligibleNodes.value.map((node) => ({
      value: node.nodeId,
      label:
        (labelCounts.get(node.label) ?? 0) > 1
          ? `${node.label} · ${truncateMiddle(node.nodeId, 8, 6)}`
          : node.label,
    })),
  ]
  if (selectedNodeId.value && !options.some((option) => option.value === selectedNodeId.value)) {
    options.push({
      value: selectedNodeId.value,
      label: `Unavailable node · ${truncateMiddle(selectedNodeId.value, 8, 6)}`,
    })
  }
  return options
})

const suggestions = computed(() => {
  const seen = new Set<string>()
  const pairs: Array<{ key: string; value: string }> = []
  for (const node of nodes.value) {
    for (const [key, value] of Object.entries(node.info?.labels ?? {})) {
      if (key.startsWith(SYSTEM_LABEL_PREFIX)) continue
      const identity = `${key}\u0000${value}`
      if (seen.has(identity)) continue
      seen.add(identity)
      pairs.push({ key, value })
    }
  }
  return pairs.sort((left, right) =>
    left.key.localeCompare(right.key) || left.value.localeCompare(right.value),
  )
})

function valuesFor(key: string): string[] {
  return suggestions.value
    .filter((suggestion) => suggestion.key === key.trim())
    .map((suggestion) => suggestion.value)
}

const constraintSlots = computed(() => rows.value.length + (selectedNodeId.value ? 1 : 0))
const atLimit = computed(() => constraintSlots.value >= MAX_LABEL_CONSTRAINTS)

function addConstraint() {
  if (atLimit.value) return
  rows.value.push({ id: nextRowId++, key: '', value: '' })
}

function updateKey(row: ConstraintRow, key: string) {
  row.key = key
  updateModel()
}

function updateValue(row: ConstraintRow, value: string) {
  row.value = value
  updateModel()
}

function removeConstraint(index: number) {
  rows.value.splice(index, 1)
  updateModel()
}
</script>

<template>
  <section class="rounded-md border border-border/70 bg-muted/20 p-3">
    <h2 class="font-display text-sm font-semibold text-aruna-navy">Placement</h2>
    <Notice v-if="nodesUnavailable" tone="error" class="mt-2" :title="realmError ?? undefined">
      <Button variant="outline" size="sm" class="mt-2" :disabled="retrying" @click="retryNodes">
        {{ retrying ? 'Retrying…' : 'Try again' }}
      </Button>
    </Notice>
    <label class="mt-2 block">
      <span class="text-xs font-medium text-foreground">Node</span>
      <Select
        v-model="nodeSelection"
        :options="nodeOptions"
        class="mt-1"
        aria-label="Run on node"
        :disabled="!selectedNodeId && rows.length >= MAX_LABEL_CONSTRAINTS"
      />
    </label>

    <div class="mt-2 space-y-2 text-xs">
      <datalist :id="labelKeysId">
        <option
          v-for="suggestion in suggestions"
          :key="`${suggestion.key}=${suggestion.value}`"
          :value="suggestion.key"
          :label="suggestion.value"
        />
      </datalist>
      <div
        v-for="(row, index) in rows"
        :key="row.id"
        class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.75rem] gap-2"
      >
        <Input
          :model-value="row.key"
          :list="labelKeysId"
          class="h-8 font-mono text-xs"
          placeholder="label key"
          :aria-label="`Label key ${index + 1}`"
          @update:model-value="updateKey(row, String($event))"
        />
        <Input
          :model-value="row.value"
          :list="labelValuesId(row.id)"
          class="h-8 font-mono text-xs"
          placeholder="value"
          :aria-label="`Label value ${index + 1}`"
          @update:model-value="updateValue(row, String($event))"
        />
        <datalist :id="labelValuesId(row.id)">
          <option v-for="value in valuesFor(row.key)" :key="value" :value="value" />
        </datalist>
        <Button
          variant="ghost"
          size="icon-sm"
          class="h-8 w-7"
          :aria-label="`Remove label constraint ${index + 1}`"
          @click="removeConstraint(index)"
        >
          <X class="h-3.5 w-3.5" />
        </Button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" :disabled="atLimit" @click="addConstraint">
          <Plus class="h-3.5 w-3.5" /> Add constraint
        </Button>
        <span v-if="atLimit" class="text-[11px] text-muted-foreground">
          Limit of {{ MAX_LABEL_CONSTRAINTS }} reached.
        </span>
      </div>
    </div>
  </section>
</template>
