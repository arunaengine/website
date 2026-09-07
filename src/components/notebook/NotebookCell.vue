<script setup lang="ts">
// One cell: code in the shared editor, markdown as it reads, and a pipeline
// cell as its own small run form. The toolbar runs it and moves it.
import { computed, defineAsyncComponent, h, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import AssistantMarkdown from '@/components/assistant/AssistantMarkdown.vue'
import NotebookOutputs from '@/components/notebook/NotebookOutputs.vue'
import NotebookPipelineCell from '@/components/notebook/NotebookPipelineCell.vue'
import { injectNotebook } from '@/composables/notebookContext'
import { asyncChunkError } from '@/lib/chunk-recovery'
import { isPipelineCell, type NotebookCell } from '@/lib/notebook/nbformat'
import { renderOutput } from '@/lib/notebook/outputs'
import { sessionRuntimeById } from '@/lib/notebook/runtimes'
import { ArrowDown, ArrowUp, Ban, GripVertical, Pencil, Play, Trash2 } from '@lucide/vue'

const ScriptEditor = defineAsyncComponent({
  loader: () => import('@/components/compute/ScriptEditor.vue'),
  loadingComponent: {
    render: () =>
      h('div', { class: 'grid h-24 place-items-center bg-field text-xs text-muted-foreground' }, 'Loading editor…'),
  },
  onError: asyncChunkError,
})

const props = defineProps<{ cell: NotebookCell; index: number }>()
const emit = defineEmits<{ (e: 'run-to-here'): void; (e: 'drag-cell', event: DragEvent): void }>()

const { notebook, session } = injectNotebook()

const pipeline = computed(() => isPipelineCell(props.cell))
const bash = computed(() => /^%%bash(?:\r?\n|$)/.test(props.cell.source))
const source = computed(() => bash.value ? props.cell.source.replace(/^%%bash\r?\n?/, '') : props.cell.source)
const highlight = computed(() => bash.value ? 'shell' : sessionRuntimeById(notebook.meta.value?.runtime ?? '')?.highlight ?? 'text')
const imageSources = computed(() => Object.fromEntries(Object.entries(props.cell.attachments ?? {}).flatMap(([name, bundle]) => {
  const rendered = renderOutput({ output_type: 'display_data', data: Object.fromEntries(Object.entries(bundle).filter(([mime]) => mime.startsWith('image/'))) })
  const url = rendered.kind === 'image' ? rendered.dataUrl : rendered.kind === 'svg' ? `data:image/svg+xml;utf8,${encodeURIComponent(rendered.text)}` : null
  return url ? [[`attachment:${name}`, url], [`attachment:${encodeURI(name)}`, url]] : []
})))
const runState = computed(() => session.cellStates.value[props.cell.id]?.state ?? null)
const busy = computed(() => runState.value === 'queued' || runState.value === 'running')
const stateLabel = computed(() => {
  const state = runState.value
  if (!state) return ''
  return state.charAt(0).toUpperCase() + state.slice(1)
})
const counter = computed(() => {
  if (props.cell.cell_type !== 'code') return ''
  if (busy.value) return '[*]'
  return props.cell.execution_count === null ? '[ ]' : `[${props.cell.execution_count}]`
})

// Markdown cells show as text until they are opened for editing.
const editing = ref(!props.cell.source.trim())

watch(() => notebook.activeCellId.value, (id) => {
  if (id !== props.cell.id) editing.value = false
})

function run() {
  if (props.cell.cell_type === 'markdown') {
    editing.value = false
    return
  }
  if (props.cell.cell_type === 'code') void session.runCell(props.cell.id, props.cell.source)
}
</script>

<template>
  <div
    class="notebook-cell surface min-w-0 overflow-hidden"
    :class="[busy ? 'border-primary/50' : '', notebook.activeCellId.value === cell.id ? 'ring-1 ring-ring' : '']"
    @click="notebook.selectCell(cell.id)"
    @keydown.shift.enter.prevent.stop="run"
  >
    <div class="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-2.5 py-1.5">
      <IconButton label="Drag to reorder cell" draggable="true" class="cursor-grab active:cursor-grabbing" @dragstart.stop="emit('drag-cell', $event)">
        <GripVertical class="size-3.5" />
      </IconButton>
      <code v-if="cell.cell_type === 'code'" class="font-mono text-[11px] text-muted-foreground">{{ counter }}</code>
      <Badge v-else variant="outline" size="sm">{{ pipeline ? 'Pipeline' : cell.cell_type }}</Badge>
      <Badge v-if="bash" variant="outline" size="sm">Bash</Badge>
      <Badge v-if="stateLabel" :variant="runState === 'error' ? 'destructive' : 'outline'" size="sm">
        {{ stateLabel }}
      </Badge>
      <span class="flex-1" />
      <template v-if="cell.cell_type === 'code'">
        <Button size="sm" variant="ghost" :disabled="!session.live.value || busy" @click="run">
          <Play class="size-3.5" /> Run
        </Button>
        <Button size="sm" variant="ghost" :disabled="!session.live.value" @click="emit('run-to-here')">
          Run to here
        </Button>
        <IconButton v-if="busy" label="Interrupt the kernel" @click="session.interrupt()">
          <Ban class="size-3.5" />
        </IconButton>
      </template>
      <Button v-if="cell.cell_type === 'markdown'" size="sm" variant="ghost" @click="editing = !editing">
        <Pencil v-if="!editing" class="size-3.5" /><Play v-else class="size-3.5" />
        {{ editing ? 'Render Markdown' : 'Edit Markdown' }}
      </Button>
      <IconButton label="Move the cell up" @click="notebook.moveCell(cell.id, -1)">
        <ArrowUp class="size-3.5" />
      </IconButton>
      <IconButton label="Move the cell down" @click="notebook.moveCell(cell.id, 1)">
        <ArrowDown class="size-3.5" />
      </IconButton>
      <IconButton label="Delete the cell" @click="notebook.removeCell(cell.id)">
        <Trash2 class="size-3.5" />
      </IconButton>
    </div>

    <NotebookPipelineCell v-if="pipeline" :cell="cell" />

    <div v-else-if="cell.cell_type === 'code'" class="min-w-0">
      <ScriptEditor
        :model-value="source"
        :language="highlight"
        @update:model-value="notebook.setSource(cell.id, bash ? `%%bash\n${$event}` : $event)"
      />
    </div>

    <div v-else class="min-w-0">
      <textarea
        v-if="editing"
        :value="cell.source"
        rows="4"
        aria-label="Markdown text"
        class="w-full resize-y bg-field p-3 font-mono text-[12px] leading-relaxed text-foreground outline-none"
        @input="notebook.setSource(cell.id, ($event.target as HTMLTextAreaElement).value)"
      />
      <div v-else class="px-3 py-2 text-sm" @dblclick="editing = true">
        <AssistantMarkdown :text="cell.source || '_Empty markdown cell._'" :image-sources="imageSources" size="full" />
      </div>
    </div>

    <NotebookOutputs v-if="cell.cell_type === 'code'" :outputs="cell.outputs" :name="`cell ${index + 1}`" />
  </div>
</template>

<style scoped>
.notebook-cell :deep(.cm-scroller) {
  min-height: 3rem;
}
</style>
