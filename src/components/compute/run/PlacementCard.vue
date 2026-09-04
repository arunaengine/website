<script setup lang="ts">
// Where the run may execute: the realm or this computer, an optional node pin,
// an executor kind and label constraints, with the nodes that still match.
import { computed, nextTick, ref, useId } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Notice from '@/components/ui/Notice.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import RunSection from '@/components/compute/run/RunSection.vue'
import RunTile from '@/components/compute/run/RunTile.vue'
import { MAX_LABEL_CONSTRAINTS, injectCustomRun } from '@/composables/useCustomRun'
import { Plus, X } from '@lucide/vue'

const {
  runTarget,
  realmName,
  pinnedNode,
  executorConstraint,
  executorKindOptions,
  constraintRows,
  addConstraint,
  removeConstraint,
  advertisedLabels,
  nodeMatches,
  leftOutReasons,
  matchCount,
  targetProblems,
} = injectCustomRun()

const CUSTOM = '__custom'
const uid = useId()
const nodeListId = `run-nodes-${uid}`
const editing = ref(false)
// A list that can grow stays behind its count until it is asked for.
const listOpen = ref(false)
const reasonsOpen = ref(false)
const showAll = ref(false)
const filter = ref('')
const customRows = ref<Set<number>>(new Set())

const local = computed(() => runTarget.local.value)
const eligible = computed(() => nodeMatches.value.matches)
const matching = computed(() => {
  const query = filter.value.trim().toLowerCase()
  if (!query) return eligible.value.length
  return eligible.value.filter((node) => node.label.toLowerCase().includes(query) || node.nodeId.toLowerCase().includes(query)).length
})
const filtered = computed(() => {
  const query = filter.value.trim().toLowerCase()
  const list = query
    ? eligible.value.filter((node) => node.label.toLowerCase().includes(query) || node.nodeId.toLowerCase().includes(query))
    : eligible.value
  return showAll.value ? list : list.slice(0, 5)
})
const pinnedLabel = computed(() => {
  const node = nodeMatches.value.matches.find((entry) => entry.nodeId === pinnedNode.value.trim())
  return node?.label ?? pinnedNode.value.trim()
})
const complete = computed(() => matchCount.value > 0 && targetProblems.value.length === 0)
const checkLabel = computed(() => (complete.value ? 'Complete' : 'No node matches'))
const targetOptions = [
  { value: 'realm', label: 'Realm, the planner chooses' },
  { value: 'local', label: 'This computer' },
]

async function toggle() {
  editing.value = !editing.value
  if (!editing.value) return
  await nextTick()
  globalThis.document?.getElementById('run-node')?.focus()
}
defineExpose({ open: () => { if (!editing.value) void toggle() } })

function keyOptions(rowId: number) {
  return [
    ...advertisedLabels.value.map((entry) => ({ value: entry.key, label: entry.key })),
    { value: CUSTOM, label: 'Custom…' },
  ].filter((option) => option.value !== CUSTOM || !customRows.value.has(rowId))
}
function valueOptions(key: string) {
  const entry = advertisedLabels.value.find((label) => label.key === key)
  return [...(entry?.values ?? []).map((value) => ({ value, label: value })), { value: CUSTOM, label: 'Custom…' }]
}
function setKey(index: number, value: string) {
  const row = constraintRows.value[index]
  if (!row) return
  if (value === CUSTOM) {
    customRows.value = new Set(customRows.value).add(row.id)
    row.key = ''
    row.value = ''
    return
  }
  row.key = value
  row.value = advertisedLabels.value.find((entry) => entry.key === value)?.values[0] ?? ''
}
function setValue(index: number, value: string) {
  const row = constraintRows.value[index]
  if (!row) return
  if (value === CUSTOM) {
    customRows.value = new Set(customRows.value).add(row.id)
    row.value = ''
    return
  }
  row.value = value
}
function addRow() {
  const first = advertisedLabels.value[0]
  addConstraint(first?.key ?? '', first?.values[0] ?? '')
  if (!first) customRows.value = new Set(customRows.value).add(constraintRows.value.at(-1)!.id)
}
function isCustom(rowId: number): boolean {
  return customRows.value.has(rowId)
}
</script>

<template>
  <RunSection id="section-placement" title="Placement" :complete="complete" :check-label="checkLabel">
    <template #state>
      Where the run may execute.
      <DocsLink topic="compute-run" label="Docs" />
    </template>
    <template #controls>
      <Button
        variant="outline"
        size="sm"
        :aria-expanded="editing"
        :aria-label="editing ? 'Done editing placement' : 'Edit placement'"
        @click="toggle"
      >
        {{ editing ? 'Done' : 'Edit' }}
      </Button>
    </template>

    <dl data-tutorial="run-placement" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <RunTile
        label="Run on"
        :tag="local ? 'chosen' : 'default'"
        :value="local ? 'This computer' : realmName"
        :sub="local ? 'results stay on your device' : 'the planner picks the node'"
      >
        <Select
          v-if="editing && runTarget.available.value"
          :model-value="runTarget.target.value"
          :options="targetOptions"
          class="h-8"
          aria-label="Run on"
          @update:model-value="(value: string) => (runTarget.target.value = value as 'realm' | 'local')"
        />
      </RunTile>
      <RunTile
        label="Node"
        :tag="pinnedNode.trim() ? 'chosen' : 'default'"
        :value="local ? 'your device' : pinnedNode.trim() ? pinnedLabel : `Any of ${matchCount}`"
        :sub="local ? '' : pinnedNode.trim() ? 'pinned' : 'next to the data'"
      >
        <Input
          v-if="editing && !local"
          id="run-node"
          v-model="pinnedNode"
          :list="nodeListId"
          class="h-8 font-mono text-xs"
          placeholder="Any node"
          aria-label="Node"
        />
      </RunTile>
      <RunTile
        label="Executor kind"
        :tag="executorConstraint.trim() ? 'chosen' : 'default'"
        :value="executorConstraint.trim() || 'Any'"
      >
        <Select
          v-if="editing && executorKindOptions.length"
          v-model="executorConstraint"
          :options="[{ value: '', label: 'Any' }, ...executorKindOptions]"
          class="h-8"
          aria-label="Executor kind"
        />
        <Input
          v-else-if="editing"
          v-model="executorConstraint"
          class="h-8 font-mono text-xs"
          placeholder="docker"
          aria-label="Executor kind"
        />
      </RunTile>
      <RunTile
        label="Constraints"
        :tag="constraintRows.length ? 'chosen' : 'default'"
        :value="constraintRows.length ? `${constraintRows.length} constraint${constraintRows.length === 1 ? '' : 's'}` : 'None'"
        :sub="`${matchCount} node${matchCount === 1 ? '' : 's'} match`"
      />
    </dl>

    <datalist :id="nodeListId">
      <option v-for="node in nodeMatches.matches" :key="node.nodeId" :value="node.nodeId" :label="node.label" />
    </datalist>

    <div v-if="editing" class="mt-3.5 space-y-3.5">
      <div>
        <span class="flex items-center gap-1.5 text-xs font-medium text-foreground">Constraints</span>
        <div class="mt-1 space-y-1.5">
          <div
            v-for="(row, index) in constraintRows"
            :key="row.id"
            class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-1.5"
          >
            <Input
              v-if="isCustom(row.id)"
              v-model="row.key"
              class="h-8 font-mono text-xs"
              placeholder="label key"
              :aria-label="`Label key ${index + 1}`"
            />
            <Select
              v-else
              :model-value="row.key"
              :options="keyOptions(row.id)"
              class="h-8 text-xs"
              :aria-label="`Label key ${index + 1}`"
              @update:model-value="(value: string) => setKey(index, value)"
            />
            <Input
              v-if="isCustom(row.id)"
              v-model="row.value"
              class="h-8 font-mono text-xs"
              placeholder="value"
              :aria-label="`Label value ${index + 1}`"
            />
            <Select
              v-else
              :model-value="row.value"
              :options="valueOptions(row.key)"
              class="h-8 text-xs"
              :aria-label="`Label value ${index + 1}`"
              @update:model-value="(value: string) => setValue(index, value)"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              class="h-8 w-8"
              :aria-label="`Remove label constraint ${index + 1}`"
              @click="removeConstraint(index)"
            >
              <X class="size-3.5" />
            </Button>
          </div>
        </div>
        <div class="mt-1.5 flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            :disabled="constraintRows.length >= MAX_LABEL_CONSTRAINTS"
            @click="addRow"
          >
            <Plus class="size-3.5" /> Add constraint
          </Button>
          <p class="text-[11px] text-muted-foreground">
            Keys and values come from what the nodes advertise.
            <DocsLink topic="compute-run" label="Docs" />
          </p>
        </div>
      </div>

      <div class="surface-inline overflow-hidden">
        <div class="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs">
          <b aria-live="polite" :class="matchCount ? '' : 'text-destructive'">
            {{ matchCount ? `${eligible.length} of ${nodeMatches.total} nodes match` : 'No node matches' }}
          </b>
          <span class="flex-1" />
          <Button variant="link" size="sm" class="h-auto p-0 text-[11px]" :aria-expanded="listOpen" @click="listOpen = !listOpen">
            {{ listOpen ? 'Hide nodes' : 'Show nodes' }}
          </Button>
        </div>
        <template v-if="listOpen">
          <div class="border-b border-border px-2.5 py-1.5">
            <Input v-model="filter" class="h-8 text-xs" placeholder="Filter matching nodes" aria-label="Filter matching nodes" />
          </div>
          <ul class="max-h-52 overflow-auto">
            <li
              v-for="node in filtered"
              :key="node.nodeId"
              class="grid grid-cols-[1.2fr_1fr_2fr] items-center gap-2.5 border-b border-border/70 px-3 py-1.5 text-xs last:border-b-0"
            >
              <span class="truncate font-medium">{{ node.label }}</span>
              <span class="truncate text-[11px] text-muted-foreground">{{ node.executorKinds.join(', ') }}</span>
              <span class="truncate text-[11px] text-muted-foreground">
                {{ Object.entries(node.info?.labels ?? {}).filter(([key]) => !key.startsWith('aruna-engine.org/')).map(([key, value]) => `${key}=${value}`).join(' · ') }}
              </span>
            </li>
            <li v-if="!filtered.length" class="px-3 py-1.5 text-[11px] text-muted-foreground">
              Loosen a constraint or pick another node.
            </li>
          </ul>
          <div v-if="!showAll && matching > 5" class="flex items-center gap-2 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>and {{ matching - 5 }} more</span>
            <Button variant="link" size="sm" class="h-auto p-0 text-[11px]" @click="showAll = true">Show all</Button>
          </div>
        </template>
      </div>

      <div v-if="leftOutReasons.length" class="text-[11px] text-muted-foreground">
        <button
          type="button"
          class="underline-offset-2 hover:underline"
          :aria-expanded="reasonsOpen"
          @click="reasonsOpen = !reasonsOpen"
        >
          Left out: {{ leftOutReasons.length }} reason{{ leftOutReasons.length === 1 ? '' : 's' }}
        </button>
        <p v-for="reason in reasonsOpen ? leftOutReasons : []" :key="reason" class="mt-0.5">{{ reason }}</p>
      </div>
    </div>

    <Notice v-if="targetProblems.length" tone="error" :lines="targetProblems" class="mt-3" />
  </RunSection>
</template>
