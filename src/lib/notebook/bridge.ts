// The notebook page lends the assistant this small API while it is open.
import type { NotebookStore } from '@/composables/useNotebook'
import type { NotebookSessionStore } from '@/composables/useNotebookSession'
import type { NotebookBridge, NotebookSummary } from '@/lib/assistant/notebookTools'
import { cellType, outputText, type NotebookCellType } from './nbformat'
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

  function editable(cellId: string): string | null {
    if (!notebook.cellById(cellId)) return `There is no cell ${cellId} in this notebook.`
    const state = session.cellStates.value[cellId]?.state
    return state === 'queued' || state === 'running' ? 'Wait for this cell to finish before editing it.' : null
  }
  function validType(kind: NotebookCellType): string | null {
    if (!['code', 'markdown', 'bash', 'pipeline'].includes(kind)) return 'Choose Code, Markdown, Bash, or Pipeline.'
    return kind === 'bash' && sessionRuntimeById(notebook.meta.value?.runtime ?? '')?.lang !== 'python' ? 'Bash cells need a Python kernel.' : null
  }

  return {
    summary,
    scope: () => JSON.stringify([notebook.scope.value, notebook.generation.value, session.jobId.value]),
    addCell: (kind, source, after) => {
      if (!notebook.meta.value) return 'The notebook is still loading.'
      const invalid = validType(kind)
      if (invalid) return invalid
      const index = after === undefined ? undefined : notebook.cells.value.findIndex((cell) => cell.id === after)
      if (index === -1) return `There is no cell ${after} in this notebook.`
      const cell = notebook.addCell(kind === 'pipeline' ? 'raw' : kind === 'bash' ? 'code' : kind, index === undefined ? undefined : index + 1, kind === 'bash' ? `%%bash\n${source.replace(/^%%bash\r?\n?/, '')}` : source, kind === 'pipeline' ? { kind: 'pipeline' } : undefined)
      notebook.selectCell(cell.id)
      return null
    },
    removeCell: (id) => { const error = editable(id); if (error) return error; notebook.removeCell(id); return null },
    moveCell: (id, offset) => {
      const error = editable(id)
      if (error) return error
      const index = notebook.cells.value.findIndex((cell) => cell.id === id) + offset
      if (!Number.isInteger(offset) || index < 0 || index >= notebook.cells.value.length) return 'The move would leave the notebook.'
      notebook.moveCell(id, offset)
      return null
    },
    setCellType: (id, kind) => {
      const error = editable(id) ?? validType(kind)
      if (error) return error
      const cell = notebook.cellById(id)!
      if (kind === 'pipeline' && cell.source.trim() && cellType(cell) !== 'pipeline') return 'Only an empty cell can become a Pipeline cell.'
      notebook.setCellType(id, kind)
      return null
    },
    save: async () => await notebook.save() ? (notebook.dirty.value ? 'Saved the earlier snapshot; newer edits still need saving.' : null) : notebook.saveError.value ?? 'The notebook could not be saved.',
    capture: () => notebook.capture(),
    startKernel,
    stopKernel: async () => {
      if (!session.running.value) return 'No session is running.'
      await session.end()
      return session.error.value ?? null
    },
    setKernel: (patch) => {
      const meta = notebook.meta.value
      if (!meta) return 'The notebook is still loading.'
      if (!Object.values(patch).some((value) => value !== undefined)) return null
      const runtime = patch.runtime ?? meta.runtime
      if (!sessionRuntimeById(runtime)) return `Unknown runtime. Choose ${SESSION_RUNTIMES.map((entry) => entry.id).join(', ')}.`
      if (patch.cpu_cores !== undefined && (!Number.isInteger(patch.cpu_cores) || patch.cpu_cores < 1 || patch.cpu_cores > 4_294_967_295)) return 'CPU cores must be a positive whole number.'
      if (patch.ram_gb !== undefined && (!Number.isFinite(patch.ram_gb) || Math.floor(patch.ram_gb * 1_000_000_000) < 1 || patch.ram_gb > 9_223_372_036)) return 'RAM must be positive and within the supported range.'
      const kind = patch.dependency_kind ?? declaredKind({ ...meta, runtime })
      if (patch.dependency_kind !== undefined && patch.dependencies === undefined) return 'Provide the dependency file text with its kind.'
      if (patch.dependencies !== undefined && (runtime === 'deno-notebook' ? kind !== 'deno' : kind !== 'requirements' && kind !== 'conda')) return 'The dependency kind does not match this runtime.'
      if (patch.runtime !== undefined && patch.dependencies === undefined && meta.dependencies?.text.trim() && (runtime === 'deno-notebook') !== (meta.dependencies.kind === 'deno')) return 'Replace the dependency list when changing between Python and Deno.'
      notebook.patchMeta({
        ...(patch.runtime !== undefined ? { runtime } : {}),
        ...(patch.dependencies !== undefined && kind ? { dependencies: { kind, text: patch.dependencies } } : {}),
        ...(patch.cpu_cores !== undefined || patch.ram_gb !== undefined ? { resources: { ...meta.resources, ...(patch.cpu_cores !== undefined ? { cpu_cores: patch.cpu_cores } : {}), ...(patch.ram_gb !== undefined ? { ram_bytes: Math.floor(patch.ram_gb * 1_000_000_000) } : {}) } } : {}),
      })
      return null
    },
    editCell: (cellId, source) => {
      const error = editable(cellId)
      if (error) return error
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
