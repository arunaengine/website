// The notebook page lends the assistant this small API while it is open.
import type { NotebookStore } from '@/composables/useNotebook'
import type { NotebookSessionStore } from '@/composables/useNotebookSession'
import type { NotebookBridge, NotebookSummary } from '@/lib/assistant/notebookTools'
import { outputText } from './nbformat'

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

  return {
    summary,
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
