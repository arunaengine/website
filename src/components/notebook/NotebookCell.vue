<script setup lang="ts">
// One cell: code in the shared editor, markdown as it reads, and a pipeline
// cell as its own small run form. The toolbar runs it and moves it.
import { computed, defineAsyncComponent, h, nextTick, ref, watch } from 'vue'
import Select from '@/components/ui/Select.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import AssistantMarkdown from '@/components/assistant/AssistantMarkdown.vue'
import NotebookOutputs from '@/components/notebook/NotebookOutputs.vue'
import NotebookPipelineCell from '@/components/notebook/NotebookPipelineCell.vue'
import { injectNotebook } from '@/composables/notebookContext'
import { asyncChunkError } from '@/lib/chunk-recovery'
import { cellType, type NotebookCell, type NotebookCellType } from '@/lib/notebook/nbformat'
import { renderOutput } from '@/lib/notebook/outputs'
import { sessionRuntimeById } from '@/lib/notebook/runtimes'
import { ArrowDown, ArrowUp, Ban, Check, ChevronsDown, CircleAlert, Clock, GripVertical, Play, Plus, Trash2 } from '@lucide/vue'

const ScriptEditor = defineAsyncComponent({
  loader: () => import('@/components/compute/ScriptEditor.vue'),
  loadingComponent: {
    render: () =>
      h('div', { class: 'grid h-24 place-items-center bg-field text-xs text-muted-foreground' }, 'Loading editor…'),
  },
  onError: asyncChunkError,
})

const props = defineProps<{ cell: NotebookCell; index: number; markdownLocked?: boolean }>()
const emit = defineEmits<{ (e: 'run-to-here'): void; (e: 'add-below'): void; (e: 'drag-cell', event: DragEvent): void }>()

const { notebook, session } = injectNotebook()

const kind = computed(() => cellType(props.cell))
const pipeline = computed(() => kind.value === 'pipeline')
const bash = computed(() => kind.value === 'bash')
const typeOptions = computed(() => [
  { value: 'code', label: 'Code' },
  { value: 'markdown', label: 'Markdown' },
  ...(sessionRuntimeById(notebook.meta.value?.runtime ?? '')?.lang === 'python' ? [{ value: 'bash', label: 'Bash' }] : []),
  ...(!props.cell.source.trim() || pipeline.value ? [{ value: 'pipeline', label: 'Pipeline' }] : []),
  ...(kind.value === 'raw' ? [{ value: 'raw', label: 'Raw' }] : []),
])
function changeType(value: string) {
  if (props.markdownLocked && props.cell.cell_type === 'markdown') return
  if (!typeOptions.value.some((option) => option.value === value)) return
  notebook.setCellType(props.cell.id, value as NotebookCellType)
  editing.value = false
}
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
// One glyph per finished run state, in the portal's state colours; a running
// cell shows the shared spinner instead.
const RUN_MARKS = {
  queued: { icon: Clock, tint: 'text-muted-foreground' },
  done: { icon: Check, tint: 'text-emerald-600 dark:text-emerald-400' },
  error: { icon: CircleAlert, tint: 'text-destructive' },
  interrupted: { icon: Ban, tint: 'text-amber-600 dark:text-amber-400' },
} as const
const runMark = computed(() => {
  const state = runState.value
  return state && state in RUN_MARKS ? RUN_MARKS[state as keyof typeof RUN_MARKS] : null
})
const counter = computed(() => {
  if (props.cell.cell_type !== 'code') return ''
  if (busy.value) return '[*]'
  return props.cell.execution_count === null ? '[ ]' : `[${props.cell.execution_count}]`
})

// Markdown cells show as text until they are opened for editing.
const editing = ref(false)
const editor = ref<HTMLTextAreaElement | null>(null)
const editorHeight = ref<number>()
let resizeOrigin: { y: number; height: number } | null = null
function startResize(event: PointerEvent) {
  if (event.button !== 0) return
  resizeOrigin = { y: event.clientY, height: editor.value?.offsetHeight ?? 112 }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function resizeEditor(event: PointerEvent) {
  if (resizeOrigin) editorHeight.value = Math.max(80, resizeOrigin.height + event.clientY - resizeOrigin.y)
}
function resizeKey(delta: number) {
  editorHeight.value = Math.max(80, (editor.value?.offsetHeight ?? 112) + delta)
}
function leaveEditor(event: FocusEvent) {
  if ((event.target as Element | null)?.hasAttribute?.('data-markdown-preview')) return
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) editing.value = false
}

watch(() => notebook.activeCellId.value, (id) => {
  if (id !== props.cell.id) editing.value = false
})
watch(() => props.markdownLocked, (locked) => {
  if (locked) editing.value = false
})
watch(notebook.lastSavedMs, () => {
  if (!notebook.dirty.value) editing.value = false
})

async function startEditing(event: MouseEvent | FocusEvent) {
  if (props.markdownLocked) return
  if ((event.target as Element | null)?.closest?.('a, button')) return
  notebook.selectCell(props.cell.id)
  editing.value = true
  await nextTick()
  editor.value?.focus()
}

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
      <Select :model-value="kind" :options="typeOptions" :disabled="busy || (markdownLocked && cell.cell_type === 'markdown')" aria-label="Cell type" class="h-6 w-auto gap-1 rounded-full border-border bg-muted/40 px-2.5 py-0 text-[11px] font-medium shadow-none [&_svg]:size-3" @update:model-value="changeType" />
      <code v-if="cell.cell_type === 'code'" class="font-mono text-[11px] text-muted-foreground">{{ counter }}</code>
      <Spinner v-if="runState === 'running'" :label="stateLabel" />
      <component
        :is="runMark.icon"
        v-else-if="runMark"
        class="size-3.5 shrink-0"
        :class="runMark.tint"
        role="img"
        :aria-label="stateLabel"
        :title="stateLabel"
      />
      <span class="flex-1" />
      <template v-if="cell.cell_type === 'code'">
        <Button size="sm" variant="ghost" :disabled="!session.live.value || busy" @click="run">
          <Play class="size-3.5" /> Run
        </Button>
        <Button size="sm" variant="ghost" :disabled="!session.live.value" @click="emit('run-to-here')">
          <ChevronsDown class="size-3.5" /> Run to here
        </Button>
        <IconButton v-if="busy" label="Interrupt the kernel" @click="session.interrupt()">
          <Ban class="size-3.5" />
        </IconButton>
      </template>
      <IconButton label="Add cell below" @click.stop="emit('add-below')">
        <Plus class="size-3.5" />
      </IconButton>
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

    <div v-else class="min-w-0" @focusout="leaveEditor">
      <textarea
        v-if="editing"
        ref="editor"
        :value="cell.source"
        rows="4"
        aria-label="Markdown text"
        :style="editorHeight ? { height: `${editorHeight}px` } : undefined"
        class="block w-full resize-none bg-field p-3 font-mono text-[12px] leading-relaxed text-foreground outline-none"
        @input="notebook.setSource(cell.id, ($event.target as HTMLTextAreaElement).value)"
      />
      <button v-if="editing" type="button" aria-label="Resize Markdown cell" title="Drag to resize; use arrow keys for small adjustments" class="flex h-5 w-full touch-none cursor-ns-resize items-center justify-center border-t border-border bg-muted/30 text-muted-foreground hover:bg-muted focus-visible:outline focus-visible:outline-ring" @pointerdown.prevent="startResize" @pointermove="resizeEditor" @pointerup="resizeOrigin = null" @lostpointercapture="resizeOrigin = null" @keydown.up.prevent="resizeKey(-24)" @keydown.down.prevent="resizeKey(24)">
        <span class="h-1 w-10 rounded-full bg-current opacity-50" />
      </button>
      <div v-if="!editing" data-markdown-preview :tabindex="markdownLocked ? -1 : 0" class="px-3 py-2 text-sm outline-none" :class="markdownLocked ? 'cursor-default' : 'cursor-text'" @focus="startEditing" @click="startEditing">
        <AssistantMarkdown :text="cell.source || '_Empty markdown cell._'" :image-sources="imageSources" mermaid size="full" />
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
