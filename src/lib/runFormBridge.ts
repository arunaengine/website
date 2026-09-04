// The run form as the assistant sees it: one reader, a few writers, and a
// single-step undo. Nothing here submits a run; Run stays the user's click.
import { RUNTIMES } from '@/lib/quickRuntimes'
import type { TesDataRefEntry } from '@/lib/tes'
import type { RunFormBridge, RunFormSummary } from '@/lib/assistant/runFormTools'
import type { CustomRunStore } from '@/composables/useCustomRun'

interface Snapshot {
  name: string
  description: string
  groupId: string
  executorMode: 'runtime' | 'custom'
  runtimeId: string
  image: string
  commandLine: string
  envRows: { key: string; value: string }[]
  script: string
  scriptPath: string
  customScript: boolean
  inputs: TesDataRefEntry[]
  outputRows: { path: string; bucket: string; key: string; keyTouched?: boolean }[]
  cpuCores: string | number
  ramGb: string | number
  diskGb: string | number
  target: string
  pinnedNode: string
  executorConstraint: string
  constraintRows: { id: number; key: string; value: string }[]
  aiMarks: string[]
}

function baseName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? ''
}

export function createRunFormBridge(store: CustomRunStore): RunFormBridge {
  let saved: Snapshot | null = null

  function summary(): RunFormSummary {
    const group = store.groupOptions.value.find((option) => option.value === store.groupId.value)
    return {
      name: store.name.value,
      description: store.description.value,
      group: group?.label ?? store.groupId.value,
      executor: {
        mode: store.executorMode.value,
        ...(store.executorMode.value === 'runtime' ? { runtime: store.runtimeId.value } : {}),
        image: store.image.value,
        command: store.commandLine.value,
        workdir: store.activeWorkdir.value,
      },
      script: store.hasScript.value
        ? {
            present: true,
            language: store.language.value.id,
            path: store.scriptPath.value,
            lines: store.script.value.split('\n').length,
          }
        : null,
      inputs: store.inputs.value.map((entry) =>
        entry.kind === 'folder'
          ? { path: entry.basePath, url: `s3://${entry.bucket}/${entry.prefix}` }
          : { path: entry.path, url: entry.url },
      ),
      outputs: store.outputRows.value.map((row) => ({ path: row.path, bucket: row.bucket, key: row.key })),
      resources: {
        cpuCores: String(store.cpuCores.value),
        ramGb: String(store.ramGb.value),
        diskGb: String(store.diskGb.value),
      },
      placement: {
        target: store.runTarget.local.value ? 'local' : 'realm',
        node: store.pinnedNode.value,
        executorKind: store.executorConstraint.value,
        constraints: store.constraintRows.value.map((row) => ({ key: row.key, value: row.value })),
        matchingNodes: store.matchCount.value,
      },
      problems: store.problems.value.map((problem) => problem.text),
      unassignedPaths: store.unassignedPaths.value.map((check) => ({
        path: check.path,
        state: check.label,
      })),
    }
  }

  function snapshot() {
    saved = {
      name: store.name.value,
      description: store.description.value,
      groupId: store.groupId.value,
      executorMode: store.executorMode.value,
      runtimeId: store.runtimeId.value,
      image: store.image.value,
      commandLine: store.commandLine.value,
      envRows: store.envRows.value.map((row) => ({ ...row })),
      script: store.script.value,
      scriptPath: store.scriptPath.value,
      customScript: store.customScript.value,
      inputs: store.inputs.value.map((entry) => ({ ...entry })),
      outputRows: store.outputRows.value.map((row) => ({ ...row })),
      cpuCores: store.cpuCores.value,
      ramGb: store.ramGb.value,
      diskGb: store.diskGb.value,
      target: store.runTarget.target.value,
      pinnedNode: store.pinnedNode.value,
      executorConstraint: store.executorConstraint.value,
      constraintRows: store.constraintRows.value.map((row) => ({ ...row })),
      aiMarks: [...store.aiMarks.value],
    }
  }

  function undo(): boolean {
    if (!saved) return false
    store.name.value = saved.name
    store.description.value = saved.description
    store.groupId.value = saved.groupId
    store.executorMode.value = saved.executorMode
    store.runtimeId.value = saved.runtimeId as (typeof RUNTIMES)[number]['id']
    store.image.value = saved.image
    store.commandLine.value = saved.commandLine
    store.envRows.value = saved.envRows
    store.script.value = saved.script
    store.scriptPath.value = saved.scriptPath
    store.customScript.value = saved.customScript
    store.inputs.value = saved.inputs
    store.outputRows.value = saved.outputRows
    store.cpuCores.value = saved.cpuCores
    store.ramGb.value = saved.ramGb
    store.diskGb.value = saved.diskGb
    store.runTarget.target.value = saved.target as 'realm' | 'local'
    store.pinnedNode.value = saved.pinnedNode
    store.executorConstraint.value = saved.executorConstraint
    store.constraintRows.value = saved.constraintRows
    store.aiMarks.value = new Set(saved.aiMarks)
    saved = null
    return true
  }

  function setField(field: 'name' | 'description' | 'group', value: string): string | null {
    if (field === 'group') {
      const match = store.groupOptions.value.find(
        (option) => option.value === value || option.label === value,
      )
      if (!match) return `No group ${value}. Available: ${store.groupOptions.value.map((o) => o.label).join(', ')}.`
      store.groupId.value = match.value
      return null
    }
    if (field === 'name') store.name.value = value
    else store.description.value = value
    store.markAi(field)
    return null
  }

  function setExecutor(input: {
    runtime?: string
    image?: string
    command?: string
    workdir?: string
  }): string | null {
    if (input.runtime) {
      const runtime = RUNTIMES.find((entry) => entry.id === input.runtime)
      if (!runtime) return `No runtime ${input.runtime}. Available: ${RUNTIMES.map((r) => r.id).join(', ')}.`
      store.chooseRuntime(runtime.id)
    } else if (input.image !== undefined || input.command !== undefined) {
      store.useCustomImage()
    }
    if (input.image !== undefined) {
      store.image.value = input.image
      store.markTouched('image')
      store.markAi('image')
    }
    if (input.command !== undefined) {
      store.commandLine.value = input.command
      store.markTouched('command')
      store.markAi('command')
    }
    if (input.workdir !== undefined) store.setWorkdir(input.workdir)
    return null
  }

  function setScript(textValue: string): string | null {
    if (!store.hasScript.value) store.addCustomScript()
    store.script.value = textValue
    store.markAi('script')
    return null
  }

  function addInput(input: { bucket: string; key: string; path?: string }): string | null {
    const bucket = input.bucket.trim()
    const key = input.key.trim().replace(/^\/+/, '')
    if (!bucket || !key) return 'An input needs a bucket and a key.'
    const path = input.path?.trim() || `${store.activeWorkdir.value}/in/${baseName(key)}`
    if (store.inputs.value.some((entry) => entry.kind === 'file' && entry.path === path)) {
      return `${path} is already staged.`
    }
    store.addInputEntry({ kind: 'file', url: `s3://${bucket}/${key}`, path, name: baseName(key) })
    store.markAiPath(path)
    return null
  }

  function captureOutput(input: { path: string; bucket?: string; key?: string }): string | null {
    const path = input.path.trim()
    if (!path.startsWith('/')) return 'A capture needs an absolute container path.'
    if (store.outputRows.value.some((row) => row.path === path)) return `${path} is already captured.`
    store.addCapture(path)
    const row = store.outputRows.value.at(-1)
    if (row) {
      if (input.bucket) row.bucket = input.bucket.trim()
      if (input.key) store.setOutputKey(row, input.key.trim())
      store.onOutputKeyBlur(row)
    }
    store.markAiPath(path)
    return null
  }

  function setResources(input: { cpu_cores?: string; ram_gb?: string; disk_gb?: string }): string | null {
    if (input.cpu_cores !== undefined) store.cpuCores.value = input.cpu_cores
    if (input.ram_gb !== undefined) store.ramGb.value = input.ram_gb
    if (input.disk_gb !== undefined) store.diskGb.value = input.disk_gb
    store.markAi('resources')
    if (!store.resourcesValid.value) return 'Those resource numbers are not valid; the form shows why.'
    return null
  }

  function setPlacement(input: {
    target?: string
    node?: string
    executor_kind?: string
    constraints?: Array<{ key: string; value: string }>
  }): string | null {
    if (input.target === 'local' && !store.runTarget.available.value) {
      return 'This computer cannot run containers, so the realm is the only target.'
    }
    if (input.target) store.runTarget.target.value = input.target as 'realm' | 'local'
    if (input.node !== undefined) store.pinnedNode.value = input.node.trim()
    if (input.executor_kind !== undefined) store.executorConstraint.value = input.executor_kind.trim()
    if (input.constraints) {
      store.setConstraints(
        Object.fromEntries(input.constraints.map((row) => [row.key.trim(), row.value.trim()])),
      )
      store.pinnedNode.value = input.node?.trim() ?? store.pinnedNode.value
    }
    store.markAi('placement')
    if (!store.matchCount.value) return 'No node matches that placement any more.'
    return null
  }

  return {
    summary,
    snapshot,
    undo,
    setField,
    setExecutor,
    setScript,
    addInput,
    captureOutput,
    setResources,
    setPlacement,
  }
}
