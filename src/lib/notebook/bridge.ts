// The notebook page lends the assistant this small API while it is open.
import type { NotebookStore } from '@/composables/useNotebook'
import type { NotebookSessionStore } from '@/composables/useNotebookSession'
import type { NotebookBridge, NotebookSummary } from '@/lib/assistant/notebookTools'
import { outputText } from './nbformat'
import { declaredKind, sessionProblems, sessionStartDraft } from './submit'
import { SESSION_RUNTIMES, sessionRuntimeById } from './runtimes'

/** How much of one output the assistant reads, so a long log stays readable. */
const OUTPUT_TEXT_CAP = 4_000
const SOURCE_CAP = 20_000

export function createNotebookBridge(
  notebook: NotebookStore,
  session: NotebookSessionStore,
): NotebookBridge {
  function summary(): NotebookSummary {
    return {
      name: notebook.name.value,
      bucket: notebook.bucket.value,
      key: notebook.key.value,
      runtime: notebook.meta.value?.runtime ?? '',
      workspace_bucket: notebook.meta.value?.workspace_bucket ?? '',
      session: {
        state: session.state.value?.state ?? (session.jobId.value ? 'not attached' : 'none'),
        kernel: session.kernel.value,
        job_id: session.jobId.value,
      },
      cells: notebook.cells.value.map((cell) => ({
        cell_id: cell.id,
        kind: cell.metadata.aruna?.kind === 'pipeline' ? 'pipeline' : cell.cell_type,
        source: cell.source.slice(0, SOURCE_CAP),
        state: session.cellStates.value[cell.id]?.state,
        execution_count: cell.execution_count,
        outputs: cell.outputs.length,
      })),
    }
  }

  /** Starts or restarts the session the way the toolbar does. */
  async function startKernel(restart: boolean): Promise<string | null> {
    const meta = notebook.meta.value
    if (!meta) return 'The notebook is still loading.'
    const problems = sessionProblems({
      groupId: meta.group_id ?? '',
      runtime: meta.runtime ?? '',
      workspaceBucket: meta.workspace_bucket ?? '',
    })
    if (problems.length) return problems.join(' ')
    if (restart && !session.running.value) return 'There is no session to restart; start one first.'
    if (!restart && session.running.value) return 'The session is already running.'
    const draft = sessionStartDraft(meta, notebook.key.value, notebook.name.value)
    await (restart ? session.restart : session.start)(draft)
    if (session.error.value) return session.error.value
    return session.running.value ? null : 'The session did not start.'
  }

  return {
    summary,
    startKernel,
    stopKernel: async () => {
      if (!session.running.value) return 'No session is running.'
      await session.end()
      return session.error.value ?? null
    },
    setKernel: (patch) => {
      const meta = notebook.meta.value
      if (!meta) return 'The notebook is still loading.'
      if (patch.runtime !== undefined) {
        if (!sessionRuntimeById(patch.runtime)) {
          return `Unknown runtime. This portal offers ${SESSION_RUNTIMES.map((runtime) => runtime.id).join(', ')}.`
        }
        notebook.patchMeta({ runtime: patch.runtime })
      }
      if (patch.dependencies !== undefined) {
        const kind = patch.dependency_kind ?? declaredKind(notebook.meta.value ?? meta)
        if (!kind) return 'This runtime takes no dependency list.'
        notebook.patchMeta({ dependencies: { kind, text: patch.dependencies } })
      }
      if (patch.cpu_cores !== undefined || patch.ram_gb !== undefined) {
        notebook.patchMeta({
          resources: {
            ...(notebook.meta.value?.resources ?? {}),
            ...(patch.cpu_cores !== undefined ? { cpu_cores: patch.cpu_cores } : {}),
            ...(patch.ram_gb !== undefined ? { ram_bytes: Math.floor(patch.ram_gb * 1_000_000_000) } : {}),
          },
        })
      }
      return null
    },
    editCell: (cellId, source) => {
      const cell = notebook.cellById(cellId)
      if (!cell) return `There is no cell ${cellId} in this notebook.`
      notebook.setSource(cellId, source)
      return null
    },
    runCell: async (cellId) => {
      const cell = notebook.cellById(cellId)
      if (!cell) return `There is no cell ${cellId} in this notebook.`
      if (cell.cell_type !== 'code') return 'Only a code cell runs in the session.'
      if (!session.live.value) return 'The session is not running; start it first.'
      return (await session.runCell(cellId, cell.source)) ? null : (session.error.value ?? 'The cell was refused.')
    },
    readOutputs: (cellId) => {
      const cell = notebook.cellById(cellId)
      if (!cell) return `There is no cell ${cellId} in this notebook.`
      return {
        cell_id: cellId,
        outputs: cell.outputs.map((output) => ({
          type: output.output_type,
          text: outputText(output).slice(0, OUTPUT_TEXT_CAP),
        })),
      }
    },
  }
}
