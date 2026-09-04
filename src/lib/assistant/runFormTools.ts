// Tools that act on the open run form. They are offered only while the run page
// is open, they never send a run, and every write asks through the approval
// gate. What a tool changed carries an AI mark until the user edits it, and one
// Undo restores the form as it was before the last applied change.
import { jsonSchema, tool, type JSONSchema7, type ToolSet } from 'ai'
import { denied, type ApprovalGate } from './types'

/** What the run page reads back to the assistant. */
export interface RunFormSummary {
  name: string
  description: string
  group: string
  executor: {
    mode: 'runtime' | 'custom'
    runtime?: string
    image: string
    command: string
    workdir: string
  }
  script: { present: boolean; language?: string; path?: string; lines?: number } | null
  inputs: Array<{ path: string; url: string }>
  outputs: Array<{ path: string; bucket: string; key: string }>
  resources: { cpuCores: string; ramGb: string; diskGb: string }
  placement: {
    target: 'realm' | 'local'
    node: string
    executorKind: string
    constraints: Array<{ key: string; value: string }>
    matchingNodes: number
  }
  problems: string[]
  unassignedPaths: Array<{ path: string; state: string }>
}

/** The small API the run page lends the assistant while it is open. */
export interface RunFormBridge {
  summary: () => RunFormSummary
  /** Records the state the last Undo restores. */
  snapshot: () => void
  undo: () => boolean
  setField: (field: 'name' | 'description' | 'group', value: string) => string | null
  setExecutor: (input: { runtime?: string; image?: string; command?: string; workdir?: string }) => string | null
  setScript: (text: string) => string | null
  addInput: (input: { bucket: string; key: string; path?: string }) => string | null
  captureOutput: (input: { path: string; bucket?: string; key?: string }) => string | null
  setResources: (input: { cpu_cores?: string; ram_gb?: string; disk_gb?: string }) => string | null
  setPlacement: (input: {
    target?: string
    node?: string
    executor_kind?: string
    constraints?: Array<{ key: string; value: string }>
  }) => string | null
}

function schema<INPUT>(properties: Record<string, unknown>, required: string[] = []) {
  return jsonSchema<INPUT>({ type: 'object', properties, required } as JSONSchema7)
}

const STRING = { type: 'string' } as const

/** Builds the run-form tool set. Every write asks first and can be undone once. */
export function runFormTools(bridge: RunFormBridge, gate: ApprovalGate): ToolSet {
  /** Runs one write: asks the gate, snapshots the form, then applies it. */
  async function write(
    name: string,
    toolCallId: string,
    input: Record<string, unknown>,
    apply: () => string | null,
  ) {
    if (gate.enabled()) {
      const approved = await gate.ask({ id: toolCallId, name, input }, false)
      if (!approved) return denied()
    }
    bridge.snapshot()
    const refusal = apply()
    if (refusal) return { error: refusal }
    return bridge.summary()
  }

  return {
    read_run_form: tool({
      description:
        'Reads the run form that is open: name, group, executor, script, inputs, outputs, '
        + 'resources, placement, and everything the run still needs.',
      inputSchema: schema<Record<string, never>>({}),
      execute: () => bridge.summary(),
    }),

    set_run_field: tool({
      description: 'Sets the run name, its description or its owning group.',
      inputSchema: schema<{ field: string; value: string }>(
        { field: { type: 'string', enum: ['name', 'description', 'group'] }, value: STRING },
        ['field', 'value'],
      ),
      execute: (input, { toolCallId }) =>
        write('set_run_field', toolCallId, input, () =>
          bridge.setField(input.field as 'name' | 'description' | 'group', input.value),
        ),
    }),

    set_run_executor: tool({
      description:
        'Sets what runs: a script runtime (python-uv, deno or bash), or a custom image with its '
        + 'command line. Fields left out keep their value.',
      inputSchema: schema<{ runtime?: string; image?: string; command?: string; workdir?: string }>({
        runtime: STRING,
        image: STRING,
        command: STRING,
        workdir: STRING,
      }),
      execute: (input, { toolCallId }) =>
        write('set_run_executor', toolCallId, input, () => bridge.setExecutor(input)),
    }),

    set_run_script: tool({
      description: 'Replaces the text of the script the run executes.',
      inputSchema: schema<{ text: string }>({ text: STRING }, ['text']),
      execute: (input, { toolCallId }) =>
        write('set_run_script', toolCallId, input, () => bridge.setScript(input.text)),
    }),

    add_run_input: tool({
      description:
        'Stages a stored object as an input of the run. Without a container path it is mounted '
        + 'under the input folder of the working directory.',
      inputSchema: schema<{ bucket: string; key: string; path?: string }>(
        { bucket: STRING, key: STRING, path: STRING },
        ['bucket', 'key'],
      ),
      execute: (input, { toolCallId }) =>
        write('add_run_input', toolCallId, input, () => bridge.addInput(input)),
    }),

    capture_run_output: tool({
      description:
        'Captures a container path after the run. A path ending in "/" captures the files written '
        + 'directly in that folder. Without a bucket and key the run\'s own destination is used.',
      inputSchema: schema<{ path: string; bucket?: string; key?: string }>(
        { path: STRING, bucket: STRING, key: STRING },
        ['path'],
      ),
      execute: (input, { toolCallId }) =>
        write('capture_run_output', toolCallId, input, () => bridge.captureOutput(input)),
    }),

    set_run_resources: tool({
      description: 'Sets what the node must offer the run. An empty value leaves the choice to the node.',
      inputSchema: schema<{ cpu_cores?: string; ram_gb?: string; disk_gb?: string }>({
        cpu_cores: STRING,
        ram_gb: STRING,
        disk_gb: STRING,
      }),
      execute: (input, { toolCallId }) =>
        write('set_run_resources', toolCallId, input, () => bridge.setResources(input)),
    }),

    set_run_placement: tool({
      description:
        'Sets where the run may execute: the realm or this computer, a pinned node, an executor '
        + 'kind, and the label constraints the nodes must advertise.',
      inputSchema: schema<{
        target?: string
        node?: string
        executor_kind?: string
        constraints?: Array<{ key: string; value: string }>
      }>({
        target: { type: 'string', enum: ['realm', 'local'] },
        node: STRING,
        executor_kind: STRING,
        constraints: {
          type: 'array',
          items: { type: 'object', properties: { key: STRING, value: STRING }, required: ['key', 'value'] },
        },
      }),
      execute: (input, { toolCallId }) =>
        write('set_run_placement', toolCallId, input, () => bridge.setPlacement(input)),
    }),

    undo_run_change: tool({
      description: 'Puts the run form back the way it was before the last change a tool applied.',
      inputSchema: schema<Record<string, never>>({}),
      execute: () =>
        bridge.undo() ? bridge.summary() : { error: 'There is no applied change to undo.' },
    }),
  }
}
