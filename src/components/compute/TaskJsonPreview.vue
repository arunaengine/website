<script setup lang="ts">
// Review-step preview of the exact TES task JSON that will be POSTed. Long
// arrays render as a one-line "[ n items ]" placeholder that expands in place:
// inputs are collapsed by default (folder expansion can make them very long),
// outputs only above OUTPUTS_COLLAPSE_OVER entries. Styling mirrors
// CodeSnippet; the copy button always copies the full JSON, whatever is
// collapsed on screen.
import { computed, ref } from 'vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import type { TesTask } from '@/lib/tes'

const props = defineProps<{ title: string; task: TesTask }>()

const OUTPUTS_COLLAPSE_OVER = 5

const inputCount = computed(() => props.task.inputs?.length ?? 0)
const outputCount = computed(() => props.task.outputs?.length ?? 0)
const inputsCollapsible = computed(() => inputCount.value > 0)
const outputsCollapsible = computed(() => outputCount.value > OUTPUTS_COLLAPSE_OVER)

const showInputs = ref(false)
const showOutputs = ref(false)

const fullJson = computed(() => JSON.stringify(props.task, null, 2))

type CollapsibleField = 'inputs' | 'outputs'
type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'toggle'; field: CollapsibleField; label: string }

// One top-level entry rendered exactly as JSON.stringify(task, null, 2) does:
// stringify the value on its own, then shift its continuation lines right.
function entryJson(key: string, value: unknown): string {
  return `  ${JSON.stringify(key)}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')}`
}

const segments = computed<Segment[]>(() => {
  const entries = Object.entries(props.task as unknown as Record<string, unknown>).filter(
    ([, value]) => value !== undefined,
  )
  const parts: Segment[] = [{ kind: 'text', text: '{\n' }]
  entries.forEach(([key, value], index) => {
    const comma = index < entries.length - 1 ? ',' : ''
    const collapsed =
      Array.isArray(value) &&
      ((key === 'inputs' && inputsCollapsible.value && !showInputs.value) ||
        (key === 'outputs' && outputsCollapsible.value && !showOutputs.value))
    if (collapsed) {
      const count = (value as unknown[]).length
      parts.push({ kind: 'text', text: `  ${JSON.stringify(key)}: ` })
      parts.push({
        kind: 'toggle',
        field: key as CollapsibleField,
        label: `[ ${count} item${count === 1 ? '' : 's'} ]`,
      })
      parts.push({ kind: 'text', text: `${comma}\n` })
    } else {
      parts.push({ kind: 'text', text: `${entryJson(key, value)}${comma}\n` })
    }
  })
  parts.push({ kind: 'text', text: '}' })
  return parts
})

function toggle(field: CollapsibleField) {
  if (field === 'inputs') showInputs.value = !showInputs.value
  else showOutputs.value = !showOutputs.value
}
function toggleLabel(field: CollapsibleField): string {
  const shown = field === 'inputs' ? showInputs.value : showOutputs.value
  if (shown) return `Hide ${field}`
  const count = field === 'inputs' ? inputCount.value : outputCount.value
  return `Show ${count} ${count === 1 ? field.slice(0, -1) : field}`
}
</script>

<template>
  <div class="rounded-md border border-border bg-muted/40 px-3 py-2">
    <div class="flex flex-wrap items-center gap-2">
      <div class="text-[10px] uppercase tracking-wider text-muted-foreground">{{ title }}</div>
      <div class="ml-auto flex items-center gap-1.5">
        <button
          v-if="inputsCollapsible"
          type="button"
          class="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          @click="toggle('inputs')"
        >
          {{ toggleLabel('inputs') }}
        </button>
        <button
          v-if="outputsCollapsible"
          type="button"
          class="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          @click="toggle('outputs')"
        >
          {{ toggleLabel('outputs') }}
        </button>
        <CopyButton :value="fullJson" :label="`Copy ${title}`" />
      </div>
    </div>
    <!-- Single line on purpose: whitespace inside <pre> is preserved verbatim. -->
    <pre class="mt-1 overflow-x-auto whitespace-pre font-mono text-[11px] leading-5 text-foreground/90"><template v-for="(segment, i) in segments" :key="i"><button v-if="segment.kind === 'toggle'" type="button" class="rounded bg-muted px-1 text-muted-foreground transition-colors hover:text-foreground" :title="toggleLabel(segment.field)" @click="toggle(segment.field)">{{ segment.label }}</button><span v-else>{{ segment.text }}</span></template></pre>
  </div>
</template>
