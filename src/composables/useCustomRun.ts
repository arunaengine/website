// Draft state and the derived TES task of the one run page: run details, the
// executor (script runtime or custom image), the script, the container
// filesystem, resources and placement. The view keeps the sections and the
// submission.
import {
  computed,
  inject,
  nextTick,
  onMounted,
  provide,
  ref,
  watch,
  type ComputedRef,
  type InjectionKey,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  TES_EXECUTOR_TAG,
  TES_GROUP_TAG,
  captureContainerPath,
  captureOutput,
  expandDataRefEntry,
  parseS3Url,
  answerEntries,
  nativeInput,
  badReference,
  atOrBelow,
  resultsKey,
  tesPlacementTags,
  validContainerDir,
  validContainerFilePath,
  type TesDataRefEntry,
  type TesExecutor,
  type TesInput,
  type TesOutput,
  type TesResources,
  type TesTask,
} from '@/lib/tes'
import { buildRunTask, runExecutor, runResources } from '@/lib/runTask'
import {
  RUNTIMES,
  SCRIPT_LANGUAGES,
  detectQuickRun,
  languageById,
  runtimeById,
  type Runtime,
  type ScriptLanguage,
} from '@/lib/quickRuntimes'
import {
  checkPaths,
  isUnassigned,
  type RunPathCheck,
  type RunPathTargets,
} from '@/lib/runPaths'
import {
  checkDependency,
  denoImportMap,
  dependenciesFromDenoConfig,
  dependencyError as dependencyRefusal,
  extractInlineDependencies,
  inlineDependencies,
  type DependencyVerificationResult,
} from '@/lib/quickDependencies'
import { bucketNameProblem, objectKeyProblem } from '@/lib/bucketName'
import { listBuckets, nodesByBucket } from '@/composables/useBucketCount'
import { quoteCommand, tokenizeCommand } from '@/lib/shellwords'
import { errorMessage } from '@/lib/utils'
import { isSecretName, type SavedRun } from '@/lib/savedRuns'
import { useSavedRuns } from '@/composables/useSavedRuns'
import { targetProblems as collectTargetProblems } from '@/lib/runTarget'
import type { useAruna } from '@/composables/useAruna'
import type { useComputeDataView } from '@/composables/useComputeDataView'
import type { useDatabases } from '@/composables/useDatabases'
import type { useRealmNodes } from '@/composables/useRealmNodes'
import type { useRunTarget } from '@/composables/useRunTarget'
import { s3ErrorMessage, type useS3 } from '@/composables/useS3'
import type { useTes } from '@/composables/useTes'

export interface CustomRunDeps {
  runTarget: ReturnType<typeof useRunTarget>
  s3: ReturnType<typeof useS3>
  myGroups: ReturnType<typeof useAruna>['myGroups']
  currentUser: ReturnType<typeof useAruna>['currentUser']
  searchBuckets: ReturnType<typeof useAruna>['searchBuckets']
  nodes: ReturnType<typeof useRealmNodes>['nodes']
  isTarget: ReturnType<typeof useRealmNodes>['isTarget']
  isLocalNode: ReturnType<typeof useRealmNodes>['isLocalNode']
  getTask: ReturnType<typeof useTes>['getTask']
  dataView: ReturnType<typeof useComputeDataView>
  realmName: ComputedRef<string>
  /** The realm's databases; results never default to one. */
  databases?: Pick<ReturnType<typeof useDatabases>, 'rows' | 'state' | 'ensure'>
}

export const U32_MAX = 4_294_967_295
export const MIN_RESOURCE_GB = 0.000000001
// TES converts decimal GB to bytes and accepts 1..=i64::MAX; this is the
// largest f64 GB value whose conversion does not round up past that limit.
export const MAX_RESOURCE_GB = 9_223_372_036.854_774

// The realm advertises limits, not defaults, so a fresh run starts here.
export const DEFAULT_RESOURCES = { cpuCores: '1', ramGb: '2', diskGb: '10' }

export const NODE_LABEL_KEY = 'aruna-engine.org/node'
// The Bakta template reads the database folder at /work/in/db; the genome path is edited to match.
const BAKTA_IMAGE = 'harbor.computational.bio.uni-giessen.de/aruna/bakta-rs@sha256:2bf286e66203f8cd5dac0e5b08a7f75156f986330d437d6eef937a3b900f32cc'
const BAKTA_COMMAND = '/bakta --db /work/in/db/ --output /work/out/ --force --prefix genome --threads 4 --skip-plot /work/in/genome.fna.gz'
const SYSTEM_LABEL_PREFIX = 'aruna-engine.org/'
export const MAX_LABEL_CONSTRAINTS = 8

// The Tree|Table choice persists per browser.
export const DATA_VIEWS = [
  { value: 'tree', label: 'Tree' },
  { value: 'table', label: 'Table' },
]

export type ExecutorMode = 'runtime' | 'custom'

export interface OutputRow {
  path: string
  bucket: string
  key: string
  /** Set once the key is edited by hand; it stops tracking the path. */
  keyTouched?: boolean
}

/** One thing the run still needs, with the field the footer jumps to. */
export interface RunProblem {
  section: string
  field: string
  text: string
}

// A container path ending in '/' is a folder capture, mapped to a wildcard
// output: only the files written directly in that folder are uploaded.
export function isDirCapture(path: string): boolean {
  return path.trim().endsWith('/')
}
export function normalizedOutputKey(key: string): string {
  return key.trim().replace(/^\/+/, '')
}
export function outputDestination(row: { bucket: string; key: string }): string {
  return `s3://${row.bucket.trim() || '<bucket>'}/${normalizedOutputKey(row.key) || '<key>'}`
}
/** The bucket folder a capture's files land in, as `bucket/folder/`. */
export function outputFolder(row: OutputRow): string {
  const key = normalizedOutputKey(row.key)
  const folder = isDirCapture(row.path) ? key : key.slice(0, key.lastIndexOf('/') + 1)
  return `${row.bucket.trim() || '<bucket>'}/${folder}`
}
/** The run name as a key segment; an unnamed run stages under "run". */
export function runSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'run'
}
// type="number" inputs emit numbers; normalize before any string handling.
function text(value: string | number): string {
  return String(value).trim()
}
function baseNameOf(path: string): string {
  return normalizedOutputKey(path).split('/').filter(Boolean).pop() ?? ''
}
function createStore(deps: CustomRunDeps) {
  const { runTarget, s3, myGroups, currentUser, getTask, dataView, realmName } = deps
  // A realm run never executes on a device; this computer has its own local run.
  const nodes = computed(() => deps.nodes.value.filter((node) => node.kind !== 'user'))
  const savedRuns = useSavedRuns()
  const router = useRouter()
  const route = useRoute()

  // ── Run ────────────────────────────────────────────────────────────────────
  const name = ref('')
  const description = ref('')
  const groupId = ref('')
  const groupOptions = computed(() => myGroups.value.map((g) => ({ value: g.id, label: g.name })))
  // A fresh id per draft keys the idempotency tag.
  const runId = ref(crypto.randomUUID())

  // ── Assistant marks ────────────────────────────────────────────────────────
  // Fields the assistant filled; the mark clears the moment the user edits one.
  const aiMarks = ref<Set<string>>(new Set())
  function markAi(field: string) {
    aiMarks.value = new Set(aiMarks.value).add(field)
  }
  function clearAi(field: string) {
    if (!aiMarks.value.has(field)) return
    const next = new Set(aiMarks.value)
    next.delete(field)
    aiMarks.value = next
  }
  function hasAi(field: string): boolean {
    return aiMarks.value.has(field)
  }
  // Container paths the assistant added; the tree marks those rows.
  const aiPaths = ref<Set<string>>(new Set())
  function markAiPath(path: string) {
    aiPaths.value = new Set(aiPaths.value).add(path)
  }
  function clearAiPath(path: string) {
    if (!aiPaths.value.has(path)) return
    const next = new Set(aiPaths.value)
    next.delete(path)
    aiPaths.value = next
  }

  // ── Executor ───────────────────────────────────────────────────────────────
  const executorMode = ref<ExecutorMode>('custom')
  const runtimeId = ref<Runtime['id']>('python-uv')
  const runtime = computed(() => runtimeById(runtimeId.value))
  const image = ref('')
  const commandLine = ref('')
  const envRows = ref<{ key: string; value: string }[]>([])
  // Fields the user changed by hand; a runtime never overwrites them again.
  const touched = ref(new Set<string>())
  function markTouched(field: string) {
    touched.value = new Set(touched.value).add(field)
  }

  // ── Working directory ──────────────────────────────────────────────────────
  // One directory anchors the whole run: executor workdir, script path, default
  // input mount and default output capture. `workdir` is the raw input text;
  // `activeWorkdir` the last valid normalized value everything derives from.
  const workdir = ref('/work')
  const activeWorkdir = ref('/work')
  const workdirNotice = ref<string | null>(null)
  const workdirValid = computed(() => {
    const value = workdir.value.trim()
    return value !== '/' && validContainerDir(value)
  })
  function normWorkdir(value: string): string {
    return value.trim().replace(/\/+$/, '')
  }
  // Editing the workdir moves existing container paths with it.
  function rewriteWorkdirPaths(previous: string, next: string) {
    const prefix = `${previous}/`
    let kept = 0
    const map = (path: string): string | null =>
      path === previous || path.startsWith(prefix) ? `${next}${path.slice(previous.length)}` : null
    for (const entry of inputs.value) {
      const mapped = map(entry.kind === 'folder' ? entry.basePath : entry.path)
      if (mapped === null) kept++
      else if (entry.kind === 'folder') entry.basePath = mapped
      else entry.path = mapped
    }
    for (const row of outputRows.value) {
      const mapped = map(row.path)
      if (mapped === null) kept++
      else setOutputPath(row, mapped)
    }
    const mappedScript = map(scriptPath.value)
    if (mappedScript !== null) scriptPath.value = mappedScript
    workdirNotice.value = kept
      ? `${kept} path${kept === 1 ? ' was' : 's were'} not under ${previous} and stayed unchanged.`
      : null
  }
  function setWorkdir(value: string) {
    workdir.value = value
    markTouched('workdir')
    const trimmed = value.trim()
    if (trimmed === '/' || !validContainerDir(trimmed)) return
    const next = normWorkdir(trimmed)
    const previous = activeWorkdir.value
    if (next === previous) return
    activeWorkdir.value = next
    rewriteWorkdirPaths(previous, next)
  }

  // ── Script ─────────────────────────────────────────────────────────────────
  // A runtime always carries a script; a custom image may add one.
  const customScript = ref(false)
  const hasScript = computed(() => executorMode.value === 'runtime' || customScript.value)
  const languageId = ref<ScriptLanguage['id']>('python')
  const language = computed(() =>
    executorMode.value === 'runtime' ? languageById(runtime.value.language) : languageById(languageId.value),
  )
  const script = ref(RUNTIMES[0].template)
  const scriptPath = ref('/work/script.py')
/** `ref` keeps the exact versioned reference a stored run named, so a rerun reads the same bytes. */
  const selectedScript = ref<{ bucket: string; key: string; content: string; ref?: string } | null>(null)
  const editorTab = ref('script')
  const dependencies = ref<string[]>([])
  const dependencyDraft = ref('')
  const stagingBucket = ref('')

  const defaultScriptPath = computed(() => `${activeWorkdir.value}/${language.value.file}`)
  watch(defaultScriptPath, (next) => {
    if (executorMode.value === 'runtime' || !touched.value.has('scriptPath')) scriptPath.value = next
  })
  function setScriptPath(value: string) {
    scriptPath.value = value
    markTouched('scriptPath')
  }

  const defaultScriptKey = computed(() => `.aruna/scripts/${runSlug(name.value)}/${language.value.file}`)
  const scriptKey = ref(defaultScriptKey.value)
  const scriptKeyTouched = ref(false)
  function setScriptKey(value: string) {
    scriptKey.value = value
    scriptKeyTouched.value = true
  }
  watch(defaultScriptKey, (next) => {
    if (!scriptKeyTouched.value) scriptKey.value = next
  })

  // Swap the template only while the script is still the previous default.
  watch(runtimeId, (next, prev) => {
    const previous = RUNTIMES.find((r) => r.id === prev)
    if (previous && script.value === previous.template) script.value = runtimeById(next).template
    dependencies.value = []
    dependencyDraft.value = ''
    dependencyVerification.value = {}
    if (!runtimeById(next).dependencies) editorTab.value = 'script'
  })

  const normalizedScriptKey = computed(() => scriptKey.value.trim())
  const scriptKeyProblem = computed(() => objectKeyProblem(normalizedScriptKey.value))
  const scriptKeyValid = computed(() => !scriptKeyProblem.value)
  const stagingScriptUrl = computed(() => `s3://${stagingBucket.value.trim()}/${normalizedScriptKey.value}`)
  const dependencyConfigPath = computed(() => `${activeWorkdir.value}/deno.json`)
  // The generated deno.json sits next to the script object.
  const dependencyConfigKey = computed(() => {
    const key = normalizedScriptKey.value
    return `${key.slice(0, key.lastIndexOf('/') + 1)}deno.json`
  })
  const dependencyConfigUrl = computed(
    () => `s3://${stagingBucket.value.trim()}/${dependencyConfigKey.value}`,
  )
  const dependencyConfig = computed(() =>
    executorMode.value !== 'runtime' || runtimeId.value !== 'deno' || !dependencies.value.length
      ? null
      : denoImportMap(dependencies.value),
  )
  const stagedScript = computed(() =>
    executorMode.value !== 'runtime' || runtimeId.value !== 'python-uv' || !dependencies.value.length
      ? script.value
      : inlineDependencies(script.value, dependencies.value),
  )
  const reuseSelectedScript = computed(() => {
    const selected = selectedScript.value
    return selected !== null && stagedScript.value === selected.content
  })
  const scriptUrl = computed(() => {
    const selected = selectedScript.value
    return reuseSelectedScript.value && selected
      ? selected.ref ?? `s3://${selected.bucket}/${selected.key}`
      : stagingScriptUrl.value
  })
  const needsStagingLocation = computed(
    () => hasScript.value && (!reuseSelectedScript.value || dependencyConfig.value !== null),
  )
  const stagedFileUrl = computed(() =>
    reuseSelectedScript.value && dependencyConfig.value ? dependencyConfigUrl.value : stagingScriptUrl.value,
  )

  // ── Runtime prefill ────────────────────────────────────────────────────────
  const defaultCommandLine = computed(() => {
    const argv = [...runtime.value.command]
    if (dependencyConfig.value) argv.push(`--config=${dependencyConfigPath.value}`)
    argv.push(scriptPath.value)
    return quoteCommand(argv)
  })
  function runtimeEnv(): { key: string; value: string }[] {
    return Object.entries(runtime.value.env ?? {}).map(([key, value]) => ({
      key,
      value: `${activeWorkdir.value}/${value}`,
    }))
  }
  /** Fills the executor fields from the runtime; `force` overwrites edits too. */
  function applyRuntimeDefaults(force = false) {
    if (force) touched.value = new Set()
    if (force || !touched.value.has('image')) image.value = runtime.value.image
    if (force || !touched.value.has('command')) commandLine.value = defaultCommandLine.value
    if (force || !touched.value.has('workdir')) {
      workdir.value = activeWorkdir.value
    }
    if (force || !touched.value.has('env')) envRows.value = runtimeEnv()
  }
  watch([defaultCommandLine, runtimeId], () => {
    if (executorMode.value === 'runtime' && !touched.value.has('command')) {
      commandLine.value = defaultCommandLine.value
    }
  })
  const runtimeEdited = computed(
    () => executorMode.value === 'runtime' && touched.value.size > 0,
  )
  function chooseRuntime(id: Runtime['id']) {
    runtimeId.value = id
    executorMode.value = 'runtime'
    customScript.value = false
    applyRuntimeDefaults(true)
  }
  function useCustomImage() {
    executorMode.value = 'custom'
    if (!touched.value.size) {
      image.value = ''
      commandLine.value = ''
      envRows.value = []
    }
  }
  function addCustomScript() {
    customScript.value = true
  }
  /** Removes the script; a runtime run becomes a custom image without one. */
  function removeScript() {
    if (executorMode.value === 'runtime') {
      executorMode.value = 'custom'
      markTouched('image')
      markTouched('command')
    }
    customScript.value = false
  }
  /**
   * Undoes "Use as script": a stored script object goes back to being a plain
   * input at the same path, and the script section closes.
   */
  function unmarkScript() {
    const stored = selectedScript.value
    const path = scriptPath.value
    removeScript()
    if (!stored) return
    addInputEntry({
      kind: 'file',
      url: stored.ref ?? `s3://${stored.bucket}/${stored.key}`,
      path,
      name: baseNameOf(path) || 'script',
    })
    selectedScript.value = null
  }

  // ── Container filesystem ───────────────────────────────────────────────────
  const inputs = ref<TesDataRefEntry[]>([])
  const outputRows = ref<OutputRow[]>([])
  const inputDialogOpen = ref(false)
  const credentialDialogOpen = ref(false)
  const inputMountDefault = ref('/work/in/')

  const runKey = computed(() => `quickruns/${runSlug(name.value)}`)
  function outputTail(containerPath: string): string {
    const relative = containerPath.startsWith(`${activeWorkdir.value}/`)
      ? containerPath.slice(activeWorkdir.value.length + 1)
      : normalizedOutputKey(containerPath)
    return relative.replace(/^out\//, '') || baseNameOf(containerPath)
  }
  function defaultOutputKey(containerPath: string): string {
    const key = `${runKey.value}/${outputTail(containerPath)}`
    return isDirCapture(containerPath) && !key.endsWith('/') ? `${key}/` : key
  }
  function lastBucket(): string {
    return outputRows.value.at(-1)?.bucket || stagingBucket.value.trim()
  }
  function addCapture(containerPath: string) {
    outputRows.value.push({
      path: containerPath,
      bucket: lastBucket(),
      key: defaultOutputKey(containerPath),
      keyTouched: false,
    })
  }
  // A destination nobody edited follows the run name.
  watch(runKey, () => {
    for (const row of outputRows.value) if (!row.keyTouched) row.key = defaultOutputKey(row.path)
  })
  function addOutputRow() {
    addCapture(`${activeWorkdir.value}/out/result.txt`)
  }
  function removeOutputRow(index: number) {
    outputRows.value.splice(index, 1)
  }
  // The destination key tracks the captured path until the key is edited.
  function setOutputPath(row: OutputRow, value: string) {
    row.path = value
    if (row.keyTouched) return
    row.key = defaultOutputKey(value)
  }
  function setOutputKey(row: OutputRow, value: string) {
    row.key = value
    row.keyTouched = true
  }
  // Folder captures write to a key prefix; append the missing slash on blur.
  function onOutputKeyBlur(row: OutputRow) {
    const key = row.key.trim()
    if (isDirCapture(row.path) && key && !key.endsWith('/')) row.key = `${key}/`
  }
  function setOutputDestination(index: number, bucket: string, key: string) {
    const row = outputRows.value[index]
    if (!row) return
    clearAiPath(row.path)
    row.bucket = bucket
    setOutputKey(row, key)
    onOutputKeyBlur(row)
  }

  /** Sends every capture below a bucket folder, such as the realm side of a linked folder. */
  function sendOutputsTo(bucket: string, prefix: string) {
    outputRows.value.forEach((row, index) =>
      setOutputDestination(index, bucket, resultsKey(prefix, runSlug(name.value), outputTail(row.path))),
    )
  }

  const treeOutputs = computed(() =>
    outputRows.value.map((row) => ({
      containerPath: row.path,
      destination: outputDestination(row),
      bucket: row.bucket,
      key: row.key,
    })),
  )
  function addInputEntry(entry: TesDataRefEntry) {
    inputs.value = [...inputs.value, entry]
  }
  function removeInputEntry(index: number) {
    inputs.value = inputs.value.filter((_, i) => i !== index)
  }
  function onTreeInputPath(index: number, path: string) {
    const previous = inputs.value[index]
    if (previous) clearAiPath(previous.kind === 'folder' ? previous.basePath : previous.path)
    inputs.value = inputs.value.map((entry, i) =>
      i === index ? (entry.kind === 'folder' ? { ...entry, basePath: path } : { ...entry, path }) : entry,
    )
  }
  function onTreeOutputPath(index: number, path: string) {
    const row = outputRows.value[index]
    if (!row) return
    clearAiPath(row.path)
    setOutputPath(row, path)
  }
  function onTreeAddOutput(containerDir: string) {
    addCapture(containerDir)
  }
  function onTreeAddFile(containerDir: string, fileName: string) {
    const dir = containerDir.endsWith('/') ? containerDir : `${containerDir}/`
    addCapture(`${dir}${fileName.replace(/^\/+/, '')}`)
  }
  function onTreeAddInput(containerDir: string) {
    inputMountDefault.value = containerDir
    inputDialogOpen.value = true
  }
  function openInputDialog(containerDir?: string) {
    inputMountDefault.value = containerDir ?? `${activeWorkdir.value}/in/`
    inputDialogOpen.value = true
  }
  /**
   * Turns a staged file into the run's script: it keeps its container path and
   * stops being a plain input. The only way back for an object added as an
   * input by mistake.
   */
  function useInputAsScript(index: number) {
    const entry = inputs.value[index]
    if (!entry || entry.kind !== 'file') return
    const parsed = parseS3Url(entry.url)
    if (!parsed) return
    customScript.value = true
    setScriptPath(entry.path)
    removeInputEntry(index)
    // A pick that would replace edited content asks in the picker dialog first.
    if (editorHasCustomContent.value) loadScriptOpen.value = true
    onScriptPick({ bucket: parsed.bucket, key: parsed.key, name: entry.name })
  }

  // ── Resources ──────────────────────────────────────────────────────────────
  const cpuCores = ref<string | number>(DEFAULT_RESOURCES.cpuCores)
  const ramGb = ref<string | number>(DEFAULT_RESOURCES.ramGb)
  const diskGb = ref<string | number>(DEFAULT_RESOURCES.diskGb)
  const resourcesEdited = computed(
    () =>
      text(cpuCores.value) !== DEFAULT_RESOURCES.cpuCores ||
      text(ramGb.value) !== DEFAULT_RESOURCES.ramGb ||
      text(diskGb.value) !== DEFAULT_RESOURCES.diskGb,
  )
  function resetResources() {
    cpuCores.value = DEFAULT_RESOURCES.cpuCores
    ramGb.value = DEFAULT_RESOURCES.ramGb
    diskGb.value = DEFAULT_RESOURCES.diskGb
  }

  // ── Placement ──────────────────────────────────────────────────────────────
  const pinnedNode = ref('')
  const executorConstraint = ref('')
  let nextRowId = 0
  const constraintRows = ref<{ id: number; key: string; value: string }[]>([])
  const executorKindOptions = computed(() =>
    [...new Set(nodes.value.flatMap((node) => node.executorKinds))]
      .sort((a, b) => a.localeCompare(b))
      .map((kind) => ({ value: kind, label: kind })),
  )
  const placementLabels = computed<Record<string, string>>(() => {
    const labels: Record<string, string> = {}
    if (pinnedNode.value.trim()) labels[NODE_LABEL_KEY] = pinnedNode.value.trim()
    for (const row of constraintRows.value) {
      const key = row.key.trim()
      if (key) labels[key] = row.value.trim()
    }
    return labels
  })
  function addConstraint(key = '', value = '') {
    if (constraintRows.value.length >= MAX_LABEL_CONSTRAINTS) return
    constraintRows.value.push({ id: nextRowId++, key, value })
  }
  function removeConstraint(index: number) {
    constraintRows.value.splice(index, 1)
  }
  function setConstraints(labels: Record<string, string>) {
    pinnedNode.value = labels[NODE_LABEL_KEY] ?? ''
    constraintRows.value = Object.entries(labels)
      .filter(([key]) => key !== NODE_LABEL_KEY)
      .map(([key, value]) => ({ id: nextRowId++, key, value }))
  }

  /** Label keys and values the realm's nodes advertise, for the constraint selects. */
  const advertisedLabels = computed(() => {
    const byKey = new Map<string, Set<string>>()
    for (const node of nodes.value) {
      for (const [key, value] of Object.entries(node.info?.labels ?? {})) {
        if (key.startsWith(SYSTEM_LABEL_PREFIX)) continue
        const values = byKey.get(key)
        if (values) values.add(value)
        else byKey.set(key, new Set([value]))
      }
    }
    return [...byKey.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => ({ key, values: [...values].sort((a, b) => a.localeCompare(b)) }))
  })

  /** The nodes a run could land on, and why the others are out. */
  const nodeMatches = computed(() => {
    const pin = pinnedNode.value.trim()
    const kind = executorConstraint.value.trim()
    const constraints = constraintRows.value
      .map((row) => ({ key: row.key.trim(), value: row.value.trim() }))
      .filter((row) => row.key)
    const reasons = { noExecutor: 0, notPinned: 0, kind: 0, labels: {} as Record<string, number> }
    const matches = nodes.value.filter((node) => {
      if (!node.executorKinds.length) {
        reasons.noExecutor++
        return false
      }
      if (pin && node.nodeId !== pin) {
        reasons.notPinned++
        return false
      }
      if (kind && !node.executorKinds.includes(kind)) {
        reasons.kind++
        return false
      }
      const labels = node.info?.labels ?? {}
      const failed = constraints.find((row) => labels[row.key] !== row.value)
      if (failed) {
        const name = `${failed.key}=${failed.value}`
        reasons.labels[name] = (reasons.labels[name] ?? 0) + 1
        return false
      }
      return true
    })
    return { matches, reasons, total: nodes.value.length }
  })
  /** Short "Left out" lines under the matching-nodes list. */
  const leftOutReasons = computed(() => {
    const { reasons } = nodeMatches.value
    const lines: string[] = []
    if (reasons.noExecutor) lines.push(`${reasons.noExecutor} nodes have no executor`)
    if (reasons.notPinned) lines.push(`${reasons.notPinned} nodes are not the pinned node`)
    if (reasons.kind) lines.push(`${reasons.kind} nodes have no ${executorConstraint.value.trim()} executor`)
    for (const [label, count] of Object.entries(reasons.labels)) {
      lines.push(`${count} nodes do not advertise ${label}`)
    }
    return lines
  })
  const matchCount = computed(() => (runTarget.local.value ? 1 : nodeMatches.value.matches.length))
  const placementSummary = computed(() => {
    if (runTarget.local.value) return 'this computer'
    const { matches } = nodeMatches.value
    if (matches.length === 1) return matches[0].label
    return `one of ${matches.length} nodes`
  })

  // ── Buckets ────────────────────────────────────────────────────────────────
  // The run group's buckets on every node, as the Data view lists them; null is the connected node.
  const bucketNodes = ref(new Map<string, string | null>())
  const buckets = computed(() => [...bucketNodes.value.keys()])
  const bucketsLoading = ref(false)
  const bucketsLoaded = ref(false)
  const bucketOptions = computed(() => buckets.value.map((b) => ({ value: b, label: b })))
  /** The node holding the staging bucket; null is the connected node. */
  const stagingNode = computed(() => bucketNodes.value.get(stagingBucket.value.trim()) ?? null)
  let bucketRun = 0
  async function loadBuckets() {
    const group = groupId.value
    if (!currentUser.value || !group) return
    const run = ++bucketRun
    const current = () => run === bucketRun && group === groupId.value
    bucketsLoading.value = true
    try {
      const listing = await listBuckets(deps.searchBuckets, group, current)
      if (!current()) return
      const found = nodesByBucket(listing.hits, deps.isTarget, deps.isLocalNode)
      bucketNodes.value = found
      // A partial list never rejects a typed name.
      bucketsLoaded.value = listing.complete
      sharedBuckets.value = new Set(listing.hits.filter((hit) => hit.set_id).map((hit) => hit.bucket))
      pickResultsBucket()
    } catch {
      if (!current()) return
      bucketNodes.value = new Map()
      bucketsLoaded.value = false
    } finally {
      if (run === bucketRun) bucketsLoading.value = false
    }
  }
  watch(groupId, () => void loadBuckets())
  // Results never default to a distributed bucket or a database, which hold shared reference data.
  const sharedBuckets = ref(new Set<string>())
  function pickResultsBucket() {
    const databases = deps.databases
    if (stagingBucket.value) return
    if (databases && databases.state.value !== 'ready' && databases.state.value !== 'failed') return
    const shared = new Set([...sharedBuckets.value, ...(databases?.rows.value.map((row) => row.bucket) ?? [])])
    stagingBucket.value = buckets.value.find((name) => !shared.has(name)) ?? ''
  }
  deps.databases?.ensure()
  watch(() => deps.databases?.state.value, pickResultsBucket)
  // Creating the first bucket from the run page; the script always stages on
  // the connected node, so the session check needs no node id.
  const creatingBucket = ref(false)
  const createBucketError = ref<string | null>(null)
  async function createBucket(wanted: string) {
    const bucket = wanted.trim()
    if (!bucket || creatingBucket.value) return
    createBucketError.value = null
    const problem = bucketNameProblem(bucket)
    if (problem) {
      createBucketError.value = problem
      return
    }
    if (!s3.canWrite(bucket)) {
      createBucketError.value = 'This session does not allow creating that bucket.'
      return
    }
    creatingBucket.value = true
    try {
      await s3.createBucket(bucket)
      await loadBuckets()
      stagingBucket.value = bucket
    } catch (err) {
      createBucketError.value = s3ErrorMessage(err, bucket)
    } finally {
      creatingBucket.value = false
    }
  }

  // Runs only write into existing buckets; once the listing is known, a typed
  // name must match it.
  function knownBucket(bucket: string): boolean {
    if (!bucket) return false
    return !bucketsLoaded.value || buckets.value.includes(bucket)
  }
  const stagingBucketValid = computed(() => knownBucket(stagingBucket.value.trim()))

  // ── Dependencies ───────────────────────────────────────────────────────────
  const dependencyError = computed(() =>
    dependencyRefusal(runtimeId.value, dependencyDraft.value, dependencies.value),
  )
  const dependencyVerification = ref<Record<string, DependencyVerificationResult>>({})
  async function verifyDependency(dependency: string): Promise<void> {
    const checked = runtimeId.value
    dependencyVerification.value = {
      ...dependencyVerification.value,
      [dependency]: { state: 'checking', detail: 'Checking registry metadata…' },
    }
    const result = await checkDependency(checked, dependency)
    if (runtimeId.value !== checked || !dependencies.value.includes(dependency)) return
    dependencyVerification.value = { ...dependencyVerification.value, [dependency]: result }
  }
  function addDependency() {
    const dependency = dependencyDraft.value.trim()
    if (!dependency || dependencyError.value) return
    dependencies.value.push(dependency)
    dependencyDraft.value = ''
    void verifyDependency(dependency)
  }
  function removeDependency(index: number) {
    const [dependency] = dependencies.value.splice(index, 1)
    if (!dependency) return
    const next = { ...dependencyVerification.value }
    delete next[dependency]
    dependencyVerification.value = next
  }

  // ── Load existing script ───────────────────────────────────────────────────
  const loadScriptOpen = ref(false)
  const loadScriptBusy = ref(false)
  const loadScriptError = ref<string | null>(null)
  const pendingScriptPick = ref<{ bucket: string; key: string; name: string; nodeId?: string | null } | null>(null)
  const editorHasCustomContent = computed(
    () => script.value.trim().length > 0 && !RUNTIMES.some((rt) => script.value === rt.template),
  )
  function inferRuntimeId(fileName: string): Runtime['id'] | null {
    if (fileName.endsWith('.py')) return 'python-uv'
    if (fileName.endsWith('.ts') || fileName.endsWith('.js')) return 'deno'
    if (fileName.endsWith('.sh')) return 'bash'
    return null
  }
  function onScriptPick(entry: { bucket: string; key: string; name: string; nodeId?: string | null }) {
    pendingScriptPick.value = entry
    loadScriptError.value = null
    if (!editorHasCustomContent.value) void applyScriptPick()
  }
  async function applyScriptPick() {
    const pick = pendingScriptPick.value
    if (!pick || loadScriptBusy.value) return
    loadScriptBusy.value = true
    loadScriptError.value = null
    try {
      const content = await (pick.nodeId ? s3.getObjectText(pick.bucket, pick.key, pick.nodeId) : s3.getObjectText(pick.bucket, pick.key))
      const inferred = inferRuntimeId(pick.name)
      if (inferred && executorMode.value === 'runtime') runtimeId.value = inferred
      script.value = content
      selectedScript.value = { bucket: pick.bucket, key: pick.key, content }
      pendingScriptPick.value = null
      loadScriptOpen.value = false
    } catch (err) {
      loadScriptError.value = errorMessage(err)
    } finally {
      loadScriptBusy.value = false
    }
  }
  watch(loadScriptOpen, (open) => {
    if (!open) return
    pendingScriptPick.value = null
    loadScriptError.value = null
    loadScriptBusy.value = false
  })

  // ── Derived task ───────────────────────────────────────────────────────────
  const commandTokens = computed(() => tokenizeCommand(commandLine.value))
  const executors = computed<TesExecutor[]>(() => [
    runExecutor({
      image: image.value,
      command: commandTokens.value.error ? [] : commandTokens.value.argv,
      env: envRows.value,
      workdir: activeWorkdir.value,
    }),
  ])

  const scriptInput = computed<TesInput | null>(() =>
    hasScript.value
      ? {
          name: language.value.file,
          description: reuseSelectedScript.value
            ? 'Existing script selected for this run'
            : 'Run script uploaded by the portal',
          url: scriptUrl.value,
          path: scriptPath.value,
          type: 'FILE',
        }
      : null,
  )
  const dependencyInput = computed<TesInput | null>(() =>
    dependencyConfig.value
      ? {
          name: 'deno.json',
          description: 'Dependency map generated by the portal',
          url: dependencyConfigUrl.value,
          path: dependencyConfigPath.value,
          type: 'FILE',
        }
      : null,
  )
  const dataInputs = computed<TesInput[]>(() => inputs.value.flatMap(expandDataRefEntry))
  const outputs = computed<TesOutput[]>(() =>
    outputRows.value
      .filter((row) => row.bucket.trim() && normalizedOutputKey(row.key) && row.path.trim())
      .map((row) => captureOutput(row.path, row.bucket, normalizedOutputKey(row.key))),
  )
  const resources = computed<TesResources>(() =>
    runResources({ cpuCores: cpuCores.value, ramGb: ramGb.value, diskGb: diskGb.value }),
  )

  const task = computed<TesTask>(() =>
    buildRunTask({
      name: name.value,
      description: description.value,
      groupId: groupId.value,
      idempotencyKey: runId.value,
      executor: executors.value[0],
      inputs: [
        ...(scriptInput.value ? [scriptInput.value] : []),
        ...(dependencyInput.value ? [dependencyInput.value] : []),
        ...dataInputs.value,
      ],
      outputs: outputs.value,
      resources: resources.value,
      executorConstraint: executorConstraint.value,
      networkOpen: dependencies.value.length > 0,
      placementLabels: runTarget.local.value ? {} : placementLabels.value,
    }),
  )

  // ── Path checks ────────────────────────────────────────────────────────────
  const pathTargets = computed<RunPathTargets>(() => ({
    workdir: activeWorkdir.value,
    scriptPath: hasScript.value ? scriptPath.value : null,
    inputs: dataInputs.value.map((input) => input.path),
    inputDirs: inputs.value.flatMap((entry) => (entry.kind === 'folder' ? [entry.basePath] : [])),
    outputs: outputRows.value.map((row) => row.path),
  }))
  const commandPaths = computed(() => checkPaths(commandLine.value, pathTargets.value))
  const scriptPaths = computed(() =>
    hasScript.value ? checkPaths(script.value, pathTargets.value) : [],
  )
  const unassignedPaths = computed(() =>
    [...commandPaths.value, ...scriptPaths.value].filter(isUnassigned),
  )
  /** Captures a path a chip reported as unassigned. */
  function capturePath(path: string) {
    addCapture(path)
  }

  // ── Validity ───────────────────────────────────────────────────────────────
  const imageValid = computed(() => image.value.trim().length > 0)
  const commandValid = computed(
    () => !commandTokens.value.error && commandTokens.value.argv.some((arg) => arg.trim()),
  )
  const inputsValid = computed(() => {
    for (const entry of inputs.value) {
      if (entry.kind === 'file' && !validContainerFilePath(entry.path.trim())) return false
      if (entry.kind === 'folder' && !validContainerDir(entry.basePath)) return false
    }
    const paths = dataInputs.value.map((input) => input.path)
    return new Set(paths).size === paths.length
  })
  const outputsValid = computed(() => {
    const rows = outputRows.value
    const validRow = (row: OutputRow) => {
      const path = row.path.trim()
      if (isDirCapture(path) ? path === '/' || !validContainerDir(path) : !validContainerFilePath(path)) {
        return false
      }
      const bucket = row.bucket.trim()
      if (!bucket || bucket.includes('/')) return false
      const key = normalizedOutputKey(row.key)
      if (!key) return false
      // Folder captures need a key prefix (trailing slash), files a plain key.
      if (isDirCapture(path) !== key.endsWith('/')) return false
      const segments = (key.endsWith('/') ? key.slice(0, -1) : key).split('/')
      return segments.every((segment) => segment && segment !== '.' && segment !== '..')
    }
    const containerPaths = rows.map((row) => row.path.trim())
    const destinations = rows.map((row) => `${row.bucket.trim()}/${normalizedOutputKey(row.key)}`)
    return (
      rows.every(validRow) &&
      new Set(containerPaths).size === containerPaths.length &&
      new Set(destinations).size === destinations.length
    )
  })
  const cpuCoresValid = computed(() => {
    const raw = text(cpuCores.value)
    if (!raw) return true
    const cpu = Number(raw)
    return Number.isInteger(cpu) && cpu >= 1 && cpu <= U32_MAX
  })
  function decimalGbValid(value: string | number): boolean {
    const raw = text(value)
    if (!raw) return true
    const gb = Number(raw)
    return Number.isFinite(gb) && gb >= MIN_RESOURCE_GB && gb <= MAX_RESOURCE_GB
  }
  const ramGbValid = computed(() => decimalGbValid(ramGb.value))
  const diskGbValid = computed(() => decimalGbValid(diskGb.value))
  const resourcesValid = computed(() => cpuCoresValid.value && ramGbValid.value && diskGbValid.value)
  const scriptStaged = computed(
    () => !needsStagingLocation.value || (stagingBucketValid.value && scriptKeyValid.value),
  )

  const targetProblems = computed(() =>
    collectTargetProblems({
      target: runTarget.local.value ? 'local' : 'realm',
      executorConstraint: executorConstraint.value,
      backend: runTarget.compute.value?.backend,
      dependencies: dependencies.value,
      // A pinned ARN carries its node and version; it counts once read as the native job reads it.
      realmInputsMissingVersion:
        (reuseSelectedScript.value && !selectedScript.value?.ref) ||
        dataInputs.value.map(nativeInput).some((input) => !input.source_node_id?.trim() || !input.version_id?.trim()),
      cpuCores: resources.value.cpu_cores,
      ramBytes:
        resources.value.ram_gb === undefined
          ? undefined
          : Math.floor(resources.value.ram_gb * 1_000_000_000),
      limits: runTarget.compute.value?.limits ?? null,
    }),
  )

  /** Everything the run still needs, in the order the sections appear. */
  const problems = computed<RunProblem[]>(() => {
    const list: RunProblem[] = []
    if (!groupId.value) {
      list.push({ section: 'section-run', field: 'run-group', text: 'Pick a group' })
    }
    if (!imageValid.value) {
      list.push({ section: 'section-executor', field: 'run-image', text: 'Image is missing' })
    }
    if (!commandValid.value) {
      list.push({ section: 'section-executor', field: 'run-command', text: 'Command is missing' })
    }
    if (hasScript.value && !script.value.trim()) {
      list.push({ section: 'section-script', field: 'run-script', text: 'The script is empty' })
    }
    if (hasScript.value && !scriptStaged.value) {
      list.push({ section: 'section-script', field: 'run-script-bucket', text: 'The script needs a bucket' })
    }
    // A run with no capture is allowed; the footer warns instead of blocking.
    if (!outputsValid.value) {
      list.push({ section: 'section-data', field: 'run-tree', text: 'An output needs a bucket and key' })
    }
    if (!inputsValid.value) {
      list.push({ section: 'section-data', field: 'run-tree', text: 'An input path is not valid' })
    }
    for (const input of dataInputs.value.filter(badReference)) {
      list.push({ section: 'section-data', field: 'run-tree', text: `The input ${input.path} names a version that cannot be read` })
    }
    if (!cpuCoresValid.value) {
      list.push({ section: 'section-resources', field: 'run-cpu', text: 'CPU cores: a whole number of 1 or more' })
    }
    if (!ramGbValid.value) {
      list.push({ section: 'section-resources', field: 'run-ram', text: 'RAM: more than 0 GB' })
    }
    if (!diskGbValid.value) {
      list.push({ section: 'section-resources', field: 'run-disk', text: 'Disk: more than 0 GB' })
    }
    if (!matchCount.value) {
      list.push({ section: 'section-placement', field: 'run-node', text: 'No node matches the placement' })
    }
    for (const path of openInputs.value) {
      list.push({ section: 'section-saved', field: 'saved-inputs', text: `Choose ${path.replace(/\/+$/, '').split('/').pop() || path}` })
    }
    for (const name of openSecrets.value) {
      list.push({ section: 'section-saved', field: 'saved-secrets', text: `Enter the value of ${name}` })
    }
    if (savedStart.value && !resultsChosen.value) {
      list.push({ section: 'section-saved', field: 'saved-results', text: 'Choose the results folder' })
    }
    for (const problem of targetProblems.value) {
      list.push({ section: 'section-placement', field: 'run-node', text: problem })
    }
    return list
  })
  const canRun = computed(() => problems.value.length === 0)

  // ── Templates and defaults ─────────────────────────────────────────────────
  const TEMPLATE_RUNTIMES: Record<string, Runtime['id']> = {
    python: 'python-uv',
    javascript: 'deno',
    bash: 'bash',
  }
  function applyTemplate(template: string | null) {
    const id = template ? TEMPLATE_RUNTIMES[template] : undefined
    if (id) chooseRuntime(id)
    else useCustomImage()
    if (template !== 'bakta') return
    image.value = BAKTA_IMAGE
    commandLine.value = BAKTA_COMMAND
    cpuCores.value = '4'
    ramGb.value = '8'
    diskGb.value = '16'
  }

  function initDefaults() {
    if (!groupId.value && myGroups.value.length) groupId.value = myGroups.value[0].id
    void loadBuckets()
  }
  onMounted(() => {
    const template = route.query.template
    applyTemplate(typeof template === 'string' ? template : null)
    initDefaults()
    for (const dependency of dependencies.value) void verifyDependency(dependency)
    const rerun = route.query.rerun
    if (typeof rerun === 'string' && rerun) void applyRerun(rerun)
    const saved = route.query.saved
    if (typeof saved === 'string' && saved) void applySaved(saved)
  })
  watch([currentUser, () => s3.hasActiveKey.value, myGroups], initDefaults)
  // Staging the script needs a session for the run's group.
  watch(
    [groupId, currentUser],
    () => {
      if (!currentUser.value || !groupId.value) return
      void s3.ensureSession(groupId.value).catch(() => {})
    },
    { immediate: true },
  )

  // ── Re-run prefill (?rerun=<taskId>) ───────────────────────────────────────
  const rerunSource = ref<{ id: string; name: string } | null>(null)
  const rerunNotes = ref<string[]>([])
  const rerunError = ref<string | null>(null)
  const rerunLoading = ref(false)

  async function applyRerun(id: string) {
    rerunLoading.value = true
    rerunError.value = null
    rerunNotes.value = []
    try {
      const source = await getTask(id, 'FULL')
      const notes = await fillFrom(source)
      rerunSource.value = { id, name: source.name || id }
      rerunNotes.value = notes
    } catch (err) {
      rerunError.value = errorMessage(err)
    } finally {
      rerunLoading.value = false
    }
  }

  // ── Saved runs (?saved=<id>): the stored request, with the asked parts left open ──
  const savedStart = ref<{ run: SavedRun; notes: string[] } | null>(null)
  const savedError = ref<string | null>(null)
  const resultsChosen = ref(false)
  /** The asked inputs of the saved run that have no pick yet. */
  const openInputs = computed(() => {
    const asked = savedStart.value?.run.ask.inputs ?? []
    return asked.filter((path) => !inputs.value.some((entry) => atOrBelow(entry, path)))
  })

  /** Secret-looking variables of the saved run that still have no value. */
  const openSecrets = computed(() =>
    savedStart.value ? envRows.value.filter((row) => isSecretName(row.key) && !row.value).map((row) => row.key) : [],
  )

  async function applySaved(id: string) {
    savedError.value = null
    const run = savedRuns.find(id)
    if (!run) {
      savedError.value = 'This run template is not on this computer.'
      return
    }
    rerunLoading.value = true
    try {
      const notes = await fillFrom(run.task)
      inputs.value = inputs.value.filter((entry) => !run.ask.inputs.some((path) => atOrBelow(entry, path)))
      resultsChosen.value = !run.ask.results
      savedStart.value = { run, notes }
    } catch (err) {
      savedError.value = errorMessage(err)
    } finally {
      rerunLoading.value = false
    }
  }

  /** Puts the picks of one choice at the path the saved run asks for, replacing an earlier answer. */
  function answerInput(path: string, entries: TesDataRefEntry[]) {
    inputs.value = [...inputs.value.filter((item) => !atOrBelow(item, path)), ...answerEntries(path, entries)]
  }

  function chooseResults(bucket: string, prefix: string) {
    sendOutputsTo(bucket, prefix)
    resultsChosen.value = true
  }

  /** Shows the whole form; the open questions stay as they are. */
  function editSaved() {
    savedStart.value = null
  }

  // Fills the form from a run request and answers notes on what could not be restored.
  async function fillFrom(source: TesTask): Promise<string[]> {
    const notes: string[] = []
    const match = detectQuickRun(source)
    // The template the run came from: a script runtime, or a custom image.
    if (match) chooseRuntime(match.runtime.id)
    else useCustomImage()

    const sourceWorkdir = source.executors?.[0]?.workdir?.trim() ?? ''
    activeWorkdir.value =
      sourceWorkdir && sourceWorkdir !== '/' && validContainerDir(sourceWorkdir)
        ? normWorkdir(sourceWorkdir)
        : '/work'
    workdir.value = activeWorkdir.value
    workdirNotice.value = null
    await nextTick()

    name.value = source.name ?? ''
    description.value = source.description ?? ''
    const group = source.tags?.[TES_GROUP_TAG]
    if (group) groupId.value = group
    executorConstraint.value = source.tags?.[TES_EXECUTOR_TAG] ?? ''
    setConstraints(tesPlacementTags(source.tags).labelConstraints)

    const executor = source.executors?.[0]
    if (executor) {
      image.value = executor.image
      commandLine.value = quoteCommand(executor.command)
      envRows.value = Object.entries(executor.env ?? {}).map(([key, value]) => ({ key, value }))
      markTouched('image')
      markTouched('command')
      markTouched('env')
      if ((source.executors?.length ?? 0) > 1) {
        notes.push('Only the first executor was restored; a run carries one.')
      }
    }

    const dataRefs = (source.inputs ?? []).filter(
      (input) => input !== match?.scriptInput && input.path !== dependencyConfigPath.value,
    )
    inputs.value = dataRefs.map((input): TesDataRefEntry => {
      const name = input.name || input.path.split('/').filter(Boolean).pop() || 'input'
      const folder = input.type === 'DIRECTORY' ? parseS3Url(input.url ?? '') : null
      if (folder) return { kind: 'folder', bucket: folder.bucket, prefix: folder.key, name, basePath: `${input.path.replace(/\/$/, '')}/`, files: [], directory: true }
      return { kind: 'file', url: input.url ?? '', path: input.path, name }
    })
    if (dataRefs.some((input) => input.name?.includes('/'))) {
      notes.push('Folder selections were restored as individual file inputs.')
    }

    outputRows.value = (source.outputs ?? []).flatMap((output) => {
      const parsed = parseS3Url(output.url)
      if (!parsed) {
        notes.push(`The output destination ${output.url} is not an s3:// URL and was not restored.`)
        return []
      }
      const path = captureContainerPath(output)
      const key = isDirCapture(path) && !parsed.key.endsWith('/') ? `${parsed.key}/` : parsed.key
      return [{ path, bucket: parsed.bucket, key, keyTouched: true }]
    })

    const r = source.resources
    cpuCores.value = r?.cpu_cores != null ? String(r.cpu_cores) : ''
    ramGb.value = r?.ram_gb != null ? String(r.ram_gb) : ''
    diskGb.value = r?.disk_gb != null ? String(r.disk_gb) : ''

    if (match) await restoreScript(match.scriptInput.url, match.runtime.id, source, notes)
    return notes
  }

  // Re-fetches the staged script; without S3 access the editor keeps the template.
  async function restoreScript(
    url: string | undefined,
    id: Runtime['id'],
    source: TesTask,
    notes: string[],
  ) {
    // A versioned object ARN names the node and exact version; it is read there and kept as is.
    const pinned = url ? nativeInput({ path: '', url }) : null
    const scriptRef = pinned?.url ? parseS3Url(pinned.url) : null
    if (!scriptRef) {
      notes.push('The original script is not an s3:// object, so its content could not be restored.')
      return
    }
    if (!pinned?.source_node_id && (!s3.hasActiveKey.value || !s3.endpoint.value)) {
      notes.push('S3 credentials are required to restore the script content; the editor shows the template.')
      return
    }
    try {
      // A pinned script is read with a session of its own node, without changing the active one.
      const reference = pinned?.source_node_id ? await s3.referenceForNode(pinned.source_node_id, groupId.value) : undefined
      const content = await s3.getObjectText(scriptRef.bucket, scriptRef.key, pinned?.source_node_id, pinned?.version_id, reference)
      const extracted =
        id === 'python-uv' ? extractInlineDependencies(content) : { script: content, dependencies: [] }
      script.value = extracted.script
      dependencies.value = extracted.dependencies
      selectedScript.value = { bucket: scriptRef.bucket, key: scriptRef.key, content, ...(pinned?.version_id ? { ref: url } : {}) }
      stagingBucket.value = scriptRef.bucket
      setScriptKey(scriptRef.key)
      for (const dependency of extracted.dependencies) void verifyDependency(dependency)
    } catch (err) {
      notes.push(`The script content could not be loaded from ${url} (${errorMessage(err)}); the editor shows the template.`)
      return
    }
    if (id !== 'deno') return
    const configInput = (source.inputs ?? []).find((input) => input.path === dependencyConfigPath.value)
    const config = configInput?.url ? nativeInput(configInput) : null
    const configRef = config?.url ? parseS3Url(config.url) : null
    if (!configRef) return
    try {
      const reference = config?.source_node_id ? await s3.referenceForNode(config.source_node_id, groupId.value) : undefined
      const list = dependenciesFromDenoConfig(await s3.getObjectText(configRef.bucket, configRef.key, config?.source_node_id, config?.version_id, reference))
      dependencies.value = list
      for (const dependency of list) void verifyDependency(dependency)
    } catch {
      notes.push('The npm dependency list (deno.json) could not be restored.')
    }
  }

  function dismissRerun() {
    rerunSource.value = null
    rerunNotes.value = []
    rerunError.value = null
    void router.replace({ query: { ...route.query, rerun: undefined } })
  }

  return {
    runTarget,
    realmName,
    dataView,
    s3,
    name,
    description,
    groupId,
    groupOptions,
    runId,
    aiMarks,
    markAi,
    clearAi,
    hasAi,
    aiPaths,
    markAiPath,
    clearAiPath,
    executorMode,
    runtimeId,
    runtime,
    runtimes: RUNTIMES,
    languages: SCRIPT_LANGUAGES,
    languageId,
    language,
    image,
    commandLine,
    commandTokens,
    envRows,
    touched,
    markTouched,
    runtimeEdited,
    applyRuntimeDefaults,
    chooseRuntime,
    useCustomImage,
    addCustomScript,
    removeScript,
    unmarkScript,
    workdir,
    activeWorkdir,
    workdirNotice,
    workdirValid,
    setWorkdir,
    hasScript,
    customScript,
    script,
    scriptPath,
    setScriptPath,
    defaultScriptPath,
    scriptKey,
    setScriptKey,
    defaultScriptKey,
    normalizedScriptKey,
    scriptKeyValid,
    scriptKeyProblem,
    stagingBucket,
    stagingBucketValid,
    stagedScript,
    stagedFileUrl,
    scriptUrl,
    reuseSelectedScript,
    selectedScript,
    needsStagingLocation,
    dependencyConfig,
    dependencyConfigKey,
    dependencyConfigPath,
    editorTab,
    dependencies,
    dependencyDraft,
    dependencyError,
    dependencyVerification,
    verifyDependency,
    addDependency,
    removeDependency,
    loadScriptOpen,
    loadScriptBusy,
    loadScriptError,
    pendingScriptPick,
    editorHasCustomContent,
    onScriptPick,
    applyScriptPick,
    inputs,
    outputRows,
    treeOutputs,
    inputDialogOpen,
    credentialDialogOpen,
    inputMountDefault,
    addCapture,
    addOutputRow,
    removeOutputRow,
    setOutputPath,
    setOutputKey,
    setOutputDestination,
    sendOutputsTo,
    onOutputKeyBlur,
    addInputEntry,
    removeInputEntry,
    onTreeInputPath,
    onTreeOutputPath,
    onTreeAddOutput,
    onTreeAddFile,
    onTreeAddInput,
    openInputDialog,
    useInputAsScript,
    buckets,
    stagingNode,
    bucketsLoading,
    bucketsLoaded,
    bucketOptions,
    loadBuckets,
    createBucket,
    creatingBucket,
    createBucketError,
    cpuCores,
    ramGb,
    diskGb,
    resourcesEdited,
    resetResources,
    pinnedNode,
    executorConstraint,
    executorKindOptions,
    constraintRows,
    addConstraint,
    removeConstraint,
    setConstraints,
    placementLabels,
    advertisedLabels,
    nodeMatches,
    leftOutReasons,
    matchCount,
    placementSummary,
    nodes,
    executors,
    outputs,
    resources,
    task,
    pathTargets,
    commandPaths,
    scriptPaths,
    unassignedPaths,
    capturePath,
    imageValid,
    commandValid,
    inputsValid,
    outputsValid,
    cpuCoresValid,
    ramGbValid,
    diskGbValid,
    resourcesValid,
    scriptStaged,
    targetProblems,
    problems,
    canRun,
    applyTemplate,
    rerunSource,
    savedStart,
    savedError,
    openInputs,
    openSecrets,
    resultsChosen,
    answerInput,
    chooseResults,
    editSaved,
    rerunNotes,
    rerunError,
    rerunLoading,
    applyRerun,
    dismissRerun,
  }
}

export type CustomRunStore = ReturnType<typeof createStore>

export const CUSTOM_RUN: InjectionKey<CustomRunStore> = Symbol('aruna.customRun')

/**
 * Creates the run store and provides it to the sections. A store provided
 * further up (the compute tutorial seeds one) is adopted instead, so the page
 * runs unchanged against a prepared draft.
 */
export function useCustomRun(deps: CustomRunDeps): CustomRunStore {
  const seeded = inject(CUSTOM_RUN, null)
  if (seeded) return seeded
  const store = createStore(deps)
  provide(CUSTOM_RUN, store)
  return store
}

/** Builds a store without providing it; the tutorial seeds one this way. */
export function createCustomRun(deps: CustomRunDeps): CustomRunStore {
  return createStore(deps)
}

export function injectCustomRun(): CustomRunStore {
  const store = inject(CUSTOM_RUN)
  if (!store) throw new Error('The run store is only available inside the run page.')
  return store
}

export type { RunPathCheck }
