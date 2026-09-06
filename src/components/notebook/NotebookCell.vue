<script setup lang="ts">
// One cell: code in the shared editor, markdown as it reads, and a pipeline
// cell as its own small run form. The toolbar runs it and moves it.
import { computed, defineAsyncComponent, h, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import AssistantMarkdown from '@/components/assistant/AssistantMarkdown.vue'
import NotebookOutputs from '@/components/notebook/NotebookOutputs.vue'
import NotebookPipelineCell from '@/components/notebook/NotebookPipelineCell.vue'
import { injectNotebook } from '@/composables/notebookContext'
import { asyncChunkError } from '@/lib/chunk-recovery'
import { isPipelineCell, type NotebookCell } from '@/lib/notebook/nbformat'
import { sessionRuntimeById } from '@/lib/notebook/runtimes'
import { ArrowDown, ArrowUp, Ban, Pencil, Play, Trash2 } from '@lucide/vue'

const ScriptEditor = defineAsyncComponent({
  loader: () => import('@/components/compute/ScriptEditor.vue'),
  loadingComponent: {
    render: () =>
      h('div', { class: 'grid h-24 place-items-center bg-field text-xs text-muted-foreground' }, 'Loading editor…'),
  },
  onError: asyncChunkError,
})

const props = defineProps<{ cell: NotebookCell; index: number }>()
const emit = defineEmits<{ (e: 'run-to-here'): void }>()

const { notebook, session } = injectNotebook()

const pipeline = computed(() => isPipelineCell(props.cell))
const highlight = computed(() => sessionRuntimeById(notebook.meta.value?.runtime ?? '')?.highlight ?? 'text')
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

function run() {
  void session.runCell(props.cell.id, props.cell.source)
}
</script>

<template>
  <div
    class="surface overflow-hidden"
    :class="[busy ? 'border-primary/50' : '', notebook.activeCellId.value === cell.id ? 'ring-1 ring-ring' : '']"
    @click="notebook.selectCell(cell.id)"
  >
    <div class="flex items-center gap-2 border-b border-border bg-muted/40 px-2.5 py-1.5">
      <code v-if="cell.cell_type === 'code'" class="font-mono text-[11px] text-muted-foreground">{{ counter }}</code>
      <Badge v-else variant="outline" size="sm">{{ pipeline ? 'Pipeline' : cell.cell_type }}</Badge>
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
      <IconButton
        v-if="cell.cell_type === 'markdown'"
        :label="editing ? 'Show the text' : 'Edit the text'"
        @click="editing = !editing"
      >
        <Pencil class="size-3.5" />
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
        :model-value="cell.source"
        :language="highlight"
        @update:model-value="notebook.setSource(cell.id, $event)"
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
        <AssistantMarkdown :text="cell.source || '_Empty markdown cell._'" size="full" />
      </div>
    </div>

    <NotebookOutputs v-if="cell.cell_type === 'code'" :outputs="cell.outputs" :name="`cell ${index + 1}`" />
  </div>
</template>
