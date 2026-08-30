// Draft state, the derived TES task and the rerun prefill of the quick run
// wizard. The view keeps the wizard steps and the submission.
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
  TES_GROUP_TAG,
  TES_IDEMPOTENCY_TAG,
  captureContainerPath,
  captureOutput,
  expandDataRefEntry,
  parseS3Url,
  placementTags,
  pruneTesTask,
  tesPlacementTags,
  validContainerDir,
  validContainerFilePath as validContainerPath,
  type TesDataRefEntry,
  type TesInput,
  type TesOutput,
  type TesTask,
} from '@/lib/tes'
import { RUNTIMES, TES_NETWORK_TAG, detectQuickRun, type Runtime } from '@/lib/quickRuntimes'
import {
  checkDependency,
  denoImportMap,
  dependenciesFromDenoConfig,
  dependencyError as dependencyRefusal,
  extractInlineDependencies,
  inlineDependencies,
  type DependencyVerificationResult,
} from '@/lib/quickDependencies'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { errorMessage } from '@/lib/utils'
import { targetProblems as collectTargetProblems } from '@/lib/runTarget'
import type { useAruna } from '@/composables/useAruna'
import type { useComputeDataView } from '@/composables/useComputeDataView'
import type { useRunTarget } from '@/composables/useRunTarget'
import { s3ErrorMessage, type useS3 } from '@/composables/useS3'
import type { useTes } from '@/composables/useTes'

export interface QuickRunDeps {
  runTarget: ReturnType<typeof useRunTarget>
  s3: ReturnType<typeof useS3>
  myGroups: ReturnType<typeof useAruna>['myGroups']
  currentUser: ReturnType<typeof useAruna>['currentUser']
  getTask: ReturnType<typeof useTes>['getTask']
  dataView: ReturnType<typeof useComputeDataView>
  realmName: ComputedRef<string>
  goStep: (target: number) => void
}

export interface OutputRow {
  bucket: string
  path: string
  containerPath: string
  keyTouched: boolean
}

// Filesystem-tree view is the default; the row grids stay as the Table view.
// The choice persists per browser (shared with the full task wizard).
export const DATA_VIEWS = [
  { value: 'tree', label: 'Tree' },
  { value: 'table', label: 'Table' },
]

export function normalizedOutputKey(path: string): string {
  return path.trim().replace(/^\/+/, '')
}
export function outputBasename(path: string): string {
  return normalizedOutputKey(path).split('/').filter(Boolean).pop() ?? ''
}
// A captured container path ending in '/' is a folder capture, mapped to a
// wildcard output: only files written directly in that folder are uploaded.
export function isDirCapture(path: string): boolean {
  return path.trim().endsWith('/')
}
// A file capture needs a plain container file path; a folder capture (trailing
// slash) an absolute directory path other than '/'.
export function validOutputContainerPath(path: string): boolean {
  const value = path.trim()
  if (value.endsWith('/')) return value !== '/' && validContainerDir(value)
  return validContainerPath(value)
}
export function outputDestination(row: { bucket: string; path: string }): string {
  return `s3://${row.bucket.trim() || '<bucket>'}/${normalizedOutputKey(row.path) || '<path>'}`
}

function createStore(deps: QuickRunDeps) {
  const { runTarget, s3, myGroups, currentUser, getTask, dataView, realmName, goStep } = deps
  const router = useRouter()
  const route = useRoute()

  const runtimeId = ref<Runtime['id']>('python-uv')
  const runtime = computed(() => RUNTIMES.find((r) => r.id === runtimeId.value) as Runtime)
  const script = ref(RUNTIMES[0].template)
  const selectedScript = ref<{ bucket: string; key: string; content: string } | null>(null)
  const editorTab = ref('work')
  const dependencies = ref<string[]>([])
  const dependencyDraft = ref('')
  const taskName = ref('Quick run')
  const groupId = ref('')
  const placementLabels = ref<Record<string, string>>({})
  // Files and folder summaries from the picker; folders expand to per-file
  // FILE inputs only at task assembly (the facade accepts FILE inputs only).
  const inputs = ref<TesDataRefEntry[]>([])
  // The script needs an S3 home before the run starts; outputs pick their own
  // bucket and key per row. The destination key defaults to quickruns/<basename>
  // and tracks the captured container path until the key is edited directly.
  const stagingBucket = ref('')
  const outputRows = ref<OutputRow[]>([])
  const inputDialogOpen = ref(false)
  const credentialDialogOpen = ref(false)
  // Container directory the input picker mounts under; the tree's per-folder
  // "add input" affordance retargets it before opening the dialog.
  const inputMountDefault = ref('/work/in/')

  // ── Working directory ──────────────────────────────────────────────────────
  // One directory anchors the whole run: executor workdir, script path, default
  // input mount, default output capture and generated files. `workdir` is the
  // raw input text; `activeWorkdir` the last valid normalized value everything
  // derives from, so mid-edit invalid states never corrupt derived paths.
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
  // Editing the workdir moves existing container paths with it: every input and
  // capture path under the previous workdir gets its prefix swapped.
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
      const mapped = map(row.containerPath)
      if (mapped === null) kept++
      else setOutputContainerPath(row, mapped)
    }
    workdirNotice.value = kept
      ? `${kept} path${kept === 1 ? ' was' : 's were'} not under ${previous} and stayed unchanged.`
      : null
  }
  function setWorkdir(value: string) {
    workdir.value = value
    const trimmed = value.trim()
    if (trimmed === '/' || !validContainerDir(trimmed)) return
    const next = normWorkdir(trimmed)
    const previous = activeWorkdir.value
    if (next === previous) return
    activeWorkdir.value = next
    rewriteWorkdirPaths(previous, next)
  }

  // A fresh id per submit attempt keys the uploaded script and the idempotency tag.
  const runId = ref(crypto.randomUUID())

  // Full S3 key of the uploaded script, freely editable. Until the user edits it
  // the key tracks this default (fresh run id + runtime file name), the same
  // pristine tracking output keys use for their captured path; one manual edit
  // pins it for good. The run id segment keeps each run's copy separate so
  // reruns never overwrite a script an earlier task references.
  const defaultScriptKey = computed(() => `.aruna/scripts/${runId.value}/${runtime.value.file}`)
  const scriptKey = ref(defaultScriptKey.value)
  const scriptKeyTouched = ref(false)
  function setScriptKey(value: string) {
    scriptKey.value = value
    scriptKeyTouched.value = true
  }
  watch(defaultScriptKey, (next) => {
    if (!scriptKeyTouched.value) scriptKey.value = next
  })

  // Swap the template only while the script is still the previous runtime default.
  watch(runtimeId, (next, prev) => {
    const prevRt = RUNTIMES.find((r) => r.id === prev)
    if (prevRt && script.value === prevRt.template) {
      script.value = (RUNTIMES.find((r) => r.id === next) as Runtime).template
    }
    dependencies.value = []
    dependencyDraft.value = ''
    dependencyVerification.value = {}
    if (next === 'bash') editorTab.value = 'work'
  })

  // ── Derived task ───────────────────────────────────────────────────────────
  const groupOptions = computed(() => myGroups.value.map((g) => ({ value: g.id, label: g.name })))
  const bucketOptions = computed(() => buckets.value.map((b) => ({ value: b, label: b })))

  // The container path is tied to the runtime's file name, not to the S3 key
  // basename: the TES input materializes the object at `path`, so the exec
  // command works no matter what the uploaded key is called.
  const scriptContainerPath = computed(() => `${activeWorkdir.value}/${runtime.value.file}`)
  const normalizedScriptKey = computed(() => scriptKey.value.trim())
  // A canonical object key: no leading slash, no empty or dot segments, and a
  // non-empty basename (a key ending in / has an empty last segment).
  const scriptKeyValid = computed(() =>
    normalizedScriptKey.value.split('/').every((segment) => segment && segment !== '.' && segment !== '..'),
  )
  const stagingScriptUrl = computed(() => `s3://${stagingBucket.value.trim()}/${normalizedScriptKey.value}`)
  const dependencyConfigPath = computed(() => `${activeWorkdir.value}/deno.json`)
  // The generated deno.json sits next to the script object, whatever directory
  // the key names.
  const dependencyConfigKey = computed(() => {
    const key = normalizedScriptKey.value
    return `${key.slice(0, key.lastIndexOf('/') + 1)}deno.json`
  })
  const dependencyConfigUrl = computed(
    () => `s3://${stagingBucket.value.trim()}/${dependencyConfigKey.value}`,
  )

  const dependencyConfig = computed(() =>
    runtimeId.value !== 'deno' || !dependencies.value.length ? null : denoImportMap(dependencies.value),
  )
  const stagedScript = computed(() =>
    runtimeId.value !== 'python-uv' || !dependencies.value.length
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
      ? `s3://${selected.bucket}/${selected.key}`
      : stagingScriptUrl.value
  })
  const needsStagingLocation = computed(() => !reuseSelectedScript.value || dependencyConfig.value !== null)
  const stagedFileUrl = computed(() =>
    reuseSelectedScript.value && dependencyConfig.value ? dependencyConfigUrl.value : stagingScriptUrl.value,
  )
  const executorCommand = computed(() => {
    return dependencyConfig.value
      ? [...runtime.value.command, `--config=${dependencyConfigPath.value}`]
      : runtime.value.command
  })
  // Runtime env values are cache dirs relative to the workspace; prefix them
  // with the run's working directory.
  const executorEnv = computed(() => {
    const env = runtime.value.env
    if (!env) return undefined
    return Object.fromEntries(
      Object.entries(env).map(([key, value]) => [key, `${activeWorkdir.value}/${value}`]),
    )
  })
  const commandPreview = computed(() => `${executorCommand.value.join(' ')} ${scriptContainerPath.value}`)

  const scriptInput = computed<TesInput>(() => ({
    name: runtime.value.file,
    description: reuseSelectedScript.value
      ? 'Existing script selected for this quick run'
      : 'Quick-run script uploaded by the portal',
    url: scriptUrl.value,
    path: scriptContainerPath.value,
    type: 'FILE',
  }))
  const dependencyInput = computed<TesInput | null>(() =>
    dependencyConfig.value
      ? {
          name: 'deno.json',
          description: 'Quick-run dependency map generated by the portal',
          url: dependencyConfigUrl.value,
          path: dependencyConfigPath.value,
          type: 'FILE',
        }
      : null,
  )
  const dataInputs = computed<TesInput[]>(() => inputs.value.flatMap(expandDataRefEntry))

  const declaredOutputs = computed<TesOutput[]>(() =>
    outputRows.value
      .filter((row) => row.bucket.trim() && outputBasename(row.path) && row.containerPath.trim())
      .map((row) => captureOutput(row.containerPath, row.bucket, normalizedOutputKey(row.path))),
  )

  const task = computed<TesTask>(() =>
    pruneTesTask({
      name: taskName.value,
      inputs: [scriptInput.value, ...(dependencyInput.value ? [dependencyInput.value] : []), ...dataInputs.value],
      outputs: declaredOutputs.value,
      executors: [
        {
          image: runtime.value.image,
          command: [...executorCommand.value, scriptContainerPath.value],
          workdir: activeWorkdir.value,
          env: executorEnv.value,
        },
      ],
      tags: {
        [TES_GROUP_TAG]: groupId.value,
        [TES_IDEMPOTENCY_TAG]: runId.value,
        ...(dependencies.value.length ? { [TES_NETWORK_TAG]: 'open' } : {}),
        ...(runTarget.local.value ? {} : placementTags(placementLabels.value)),
      },
    }),
  )

  // ── Review summary ─────────────────────────────────────────────────────────
  const reviewInputs = computed(() => [
    {
      label: runtime.value.file,
      title: scriptUrl.value,
      note: reuseSelectedScript.value ? 'reused without upload' : 'uploaded when the run starts',
      ...(runtimeId.value === 'python-uv' && dependencies.value.length
        ? { badge: `${dependencies.value.length} inline dependencies` }
        : {}),
      path: scriptContainerPath.value,
    },
    ...(dependencyInput.value
      ? [
          {
            label: 'deno.json',
            title: dependencyConfigUrl.value,
            note: 'generated from dependencies',
            path: dependencyConfigPath.value,
          },
        ]
      : []),
    ...inputs.value.map((entry) =>
      entry.kind === 'folder'
        ? {
            label: `s3://${entry.bucket}/${entry.prefix}`,
            note: `${entry.files.length} file${entry.files.length === 1 ? '' : 's'}`,
            path: entry.basePath,
          }
        : { label: entry.url, path: entry.path },
    ),
  ])
  const reviewOutputs = computed(() =>
    declaredOutputs.value.map((output) => ({ label: output.path, path: output.url })),
  )

  // ── Dependencies ───────────────────────────────────────────────────────────
  const dependencyError = computed(() =>
    dependencyRefusal(runtimeId.value, dependencyDraft.value, dependencies.value),
  )
  const dependencyVerification = ref<Record<string, DependencyVerificationResult>>({})

  async function verifyDependency(dependency: string): Promise<void> {
    const checkedRuntime = runtimeId.value
    dependencyVerification.value = {
      ...dependencyVerification.value,
      [dependency]: { state: 'checking', detail: 'Checking registry metadata…' },
    }
    const result = await checkDependency(checkedRuntime, dependency)
    if (runtimeId.value !== checkedRuntime || !dependencies.value.includes(dependency)) return
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
    if (dependency) {
      const next = { ...dependencyVerification.value }
      delete next[dependency]
      dependencyVerification.value = next
    }
  }

  // ── Inputs / outputs editing ───────────────────────────────────────────────
  function uniqueInputName(base: string): string {
    const taken = new Set(inputs.value.map((i) => i.name))
    if (!taken.has(base)) return base
    const dot = base.lastIndexOf('.')
    const stem = dot > 0 ? base.slice(0, dot) : base
    const ext = dot > 0 ? base.slice(dot) : ''
    let n = 2
    while (taken.has(`${stem}-${n}${ext}`)) n++
    return `${stem}-${n}${ext}`
  }
  // The dialog already mounts picks under the chosen directory (Quick Run
  // passes /work/in/ as the default); only name collisions are fixed up here,
  // keeping the mount aligned with the renamed entry.
  function addInput(entry: TesDataRefEntry) {
    const base =
      (entry.name || (entry.kind === 'file' ? entry.url.split('/').filter(Boolean).pop() : '') || 'input').trim()
    const name = uniqueInputName(base)
    if (entry.kind === 'folder') {
      const basePath = entry.basePath.endsWith(`${entry.name}/`)
        ? `${entry.basePath.slice(0, entry.basePath.length - entry.name.length - 1)}${name}/`
        : entry.basePath
      inputs.value.push({ ...entry, name, basePath })
      return
    }
    const path = entry.path.endsWith(entry.name)
      ? `${entry.path.slice(0, entry.path.length - entry.name.length)}${name}`
      : entry.path
    inputs.value.push({ kind: 'file', url: entry.url, name, path })
  }
  function removeInput(i: number) {
    inputs.value.splice(i, 1)
  }
  function addOutput() {
    const containerPath = `${activeWorkdir.value}/out/result.txt`
    outputRows.value.push({
      bucket: outputRows.value.at(-1)?.bucket || stagingBucket.value.trim() || buckets.value[0] || '',
      containerPath,
      path: `quickruns/${outputBasename(containerPath)}`,
      keyTouched: false,
    })
  }
  function keyDirOf(key: string): string {
    const trimmed = normalizedOutputKey(key).replace(/\/+$/, '')
    const index = trimmed.lastIndexOf('/')
    return index === -1 ? '' : trimmed.slice(0, index + 1)
  }
  // The destination key tracks the captured path's basename (and folder shape)
  // until the user edits the key directly.
  function setOutputContainerPath(row: OutputRow, value: string) {
    row.containerPath = value
    if (row.keyTouched) return
    const base = outputBasename(value)
    row.path = `${keyDirOf(row.path)}${base}${isDirCapture(value) && base ? '/' : ''}`
  }
  function setOutputKey(row: OutputRow, value: string) {
    row.path = value
    row.keyTouched = true
  }
  // Folder captures write to a key prefix; a missing trailing slash is appended
  // rather than rejected.
  function onOutputKeyBlur(row: OutputRow) {
    const key = row.path.trim()
    if (isDirCapture(row.containerPath) && key && !key.endsWith('/')) row.path = `${key}/`
  }
  function removeOutput(i: number) {
    outputRows.value.splice(i, 1)
  }

  // ── Filesystem-tree wiring ─────────────────────────────────────────────────
  const treeOutputs = computed(() =>
    outputRows.value.map((row) => ({ containerPath: row.containerPath, destination: outputDestination(row) })),
  )
  function onTreeInputPath(index: number, path: string) {
    const entry = inputs.value[index]
    if (!entry) return
    if (entry.kind === 'folder') entry.basePath = path
    else entry.path = path
  }
  function onTreeOutputPath(index: number, path: string) {
    const row = outputRows.value[index]
    if (row) setOutputContainerPath(row, path)
  }
  // Capturing a folder from the tree creates a directory-capture row with the
  // same default destination shape addOutput uses.
  function onTreeAddOutput(containerDir: string) {
    const base = outputBasename(containerDir)
    outputRows.value.push({
      bucket: outputRows.value.at(-1)?.bucket || stagingBucket.value.trim() || buckets.value[0] || '',
      containerPath: containerDir,
      path: `quickruns/${base}${base ? '/' : ''}`,
      keyTouched: false,
    })
  }
  function onTreeAddInput(containerDir: string) {
    inputMountDefault.value = containerDir
    inputDialogOpen.value = true
  }
  function openInputDialog() {
    inputMountDefault.value = `${activeWorkdir.value}/in/`
    inputDialogOpen.value = true
  }

  // ── Load existing script ───────────────────────────────────────────────────
  // Reuses an unchanged script object from any bucket. Editing it or Python
  // dependency injection falls back to the per-run upload path.
  const loadScriptOpen = ref(false)
  const loadScriptBusy = ref(false)
  const loadScriptError = ref<string | null>(null)
  const pendingScriptPick = ref<{ bucket: string; key: string; name: string } | null>(null)

  // Any non-empty content that is not a pristine runtime template is guarded by
  // an explicit confirm before it gets replaced.
  const editorHasCustomContent = computed(
    () => script.value.trim().length > 0 && !RUNTIMES.some((rt) => script.value === rt.template),
  )

  function inferRuntimeId(name: string): Runtime['id'] | null {
    if (name.endsWith('.py')) return 'python-uv'
    if (name.endsWith('.ts') || name.endsWith('.js')) return 'deno'
    if (name.endsWith('.sh')) return 'bash'
    return null
  }

  function onScriptPick(entry: { bucket: string; key: string; name: string }) {
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
      const text = await s3.getObjectText(pick.bucket, pick.key)
      // Runtime first: its watcher only swaps pristine templates and resets the
      // dependency list, then the fetched text lands in the editor. The
      // destination key is untouched; a pristine default just follows the new
      // runtime file name.
      const inferred = inferRuntimeId(pick.name)
      if (inferred) runtimeId.value = inferred
      script.value = text
      selectedScript.value = { bucket: pick.bucket, key: pick.key, content: text }
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

  // ── Buckets ────────────────────────────────────────────────────────────────
  const buckets = ref<string[]>([])
  const bucketsLoading = ref(false)
  const bucketsLoaded = ref(false)
  async function loadBuckets() {
    if (!s3.hasActiveKey.value || !s3.endpoint.value) return
    bucketsLoading.value = true
    try {
      // Per-run ws-… scratch buckets are system-managed and never run targets.
      buckets.value = (await s3.listBuckets()).map((b) => b.name).filter((name) => !isWorkspaceBucket(name))
      bucketsLoaded.value = true
      if (!stagingBucket.value && buckets.value.length) stagingBucket.value = buckets.value[0]
    } catch {
      buckets.value = []
      bucketsLoaded.value = false
    } finally {
      bucketsLoading.value = false
    }
  }

  // Creating the first bucket from the wizard; the quick run always stages on
  // the connected node, so the session check needs no node id.
  const creatingBucket = ref(false)
  const createBucketError = ref<string | null>(null)
  async function createBucket(name: string) {
    const wanted = name.trim()
    if (!wanted || creatingBucket.value) return
    createBucketError.value = null
    if (!s3.canWrite(wanted)) {
      createBucketError.value = 'This session does not allow creating that bucket.'
      return
    }
    creatingBucket.value = true
    try {
      await s3.createBucket(wanted)
      await loadBuckets()
      stagingBucket.value = wanted
    } catch (err) {
      createBucketError.value = s3ErrorMessage(err)
    } finally {
      creatingBucket.value = false
    }
  }

  // Runs only write into existing buckets; once the listing is known, a typed
  // name must match it (with a failed listing only non-empty is enforceable).
  function knownBucket(name: string): boolean {
    if (!name) return false
    return !bucketsLoaded.value || buckets.value.includes(name)
  }
  const stagingBucketValid = computed(() => knownBucket(stagingBucket.value.trim()))

  function initDefaults() {
    if (!groupId.value && myGroups.value.length) groupId.value = myGroups.value[0].id
    void loadBuckets()
  }
  onMounted(() => {
    initDefaults()
    // Existing dependencies (e.g. after "Run again") are re-checked automatically.
    for (const dependency of dependencies.value) void verifyDependency(dependency)
    const rerun = route.query.rerun
    if (typeof rerun === 'string' && rerun) void applyRerun(rerun)
  })
  watch([currentUser, () => s3.hasActiveKey.value, myGroups], initDefaults)

  // ── Validity ───────────────────────────────────────────────────────────────
  const inputsValid = computed(() => {
    for (const entry of inputs.value) {
      if (entry.kind === 'file' && !validContainerPath(entry.path.trim())) return false
      if (entry.kind === 'folder' && !validContainerDir(entry.basePath)) return false
    }
    // Uniqueness across all EXPANDED container paths (folders count per file).
    const paths = dataInputs.value.map((input) => input.path)
    return new Set(paths).size === paths.length
  })
  const outputsValid = computed(() => {
    const rows = outputRows.value
    const validRow = (row: { bucket: string; path: string; containerPath: string }) => {
      if (!knownBucket(row.bucket.trim())) return false
      if (!validOutputContainerPath(row.containerPath)) return false
      const key = normalizedOutputKey(row.path)
      if (!key) return false
      // Folder captures need a key prefix (trailing slash), file captures a
      // plain object key.
      const dir = isDirCapture(row.containerPath)
      if (dir !== key.endsWith('/')) return false
      const segments = (dir ? key.slice(0, -1) : key).split('/')
      return segments.every((segment) => segment && segment !== '.' && segment !== '..')
    }
    // The backend rejects duplicate container paths and destinations; block
    // collisions on both sides here (normalized values).
    const containerPaths = rows.map((row) => row.containerPath.trim())
    const destinations = rows.map((row) => `${row.bucket.trim()}/${normalizedOutputKey(row.path)}`)
    return (
      rows.every(validRow) &&
      new Set(containerPaths).size === containerPaths.length &&
      new Set(destinations).size === destinations.length
    )
  })
  const dataReady = computed(
    () =>
      !!s3.endpoint.value &&
      s3.hasActiveKey.value &&
      groupId.value.length > 0 &&
      (!needsStagingLocation.value || (stagingBucketValid.value && scriptKeyValid.value)),
  )
  const targetProblems = computed(() =>
    collectTargetProblems({
      target: runTarget.local.value ? 'local' : 'realm',
      dependencies: dependencies.value,
      realmInputsMissingVersion:
        reuseSelectedScript.value ||
        dataInputs.value.some((input) => !input.source_node_id?.trim() || !input.version_id?.trim()),
      cpuCores: task.value.resources?.cpu_cores,
      ramBytes:
        task.value.resources?.ram_gb === undefined
          ? undefined
          : Math.floor(task.value.resources.ram_gb * 1_000_000_000),
      limits: runTarget.compute.value?.limits ?? null,
    }),
  )

  // ── Re-run prefill (?rerun=<taskId>) ───────────────────────────────────────
  // The task id rides in the query so a page refresh re-applies the prefill.
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
      const match = detectQuickRun(source)
      if (!match) {
        rerunError.value = 'This run was not created by Quick run. Use Custom run to run it again.'
        return
      }
      const notes: string[] = []
      runtimeId.value = match.runtime.id
      // Restore the working directory directly (no prefix rewrite: the restored
      // inputs and outputs below already carry the original paths).
      const sourceWorkdir = source.executors?.[0]?.workdir?.trim() ?? ''
      activeWorkdir.value =
        sourceWorkdir && sourceWorkdir !== '/' && validContainerDir(sourceWorkdir) ? normWorkdir(sourceWorkdir) : '/work'
      workdir.value = activeWorkdir.value
      workdirNotice.value = null
      // Let the runtime watcher (template swap + dependency reset) run before
      // the restored values land, or it would clobber them.
      await nextTick()
      taskName.value = source.name || 'Quick run'
      const group = source.tags?.[TES_GROUP_TAG]
      if (group) groupId.value = group
      placementLabels.value = tesPlacementTags(source.tags).labelConstraints

      // Data inputs: everything except the staged script and generated deno.json.
      const sourceDataInputs = (source.inputs ?? []).filter(
        (input) => input !== match.scriptInput && input.path !== dependencyConfigPath.value,
      )
      inputs.value = sourceDataInputs.map((input) => ({
        kind: 'file',
        url: input.url ?? '',
        path: input.path,
        name: input.name || input.path.split('/').filter(Boolean).pop() || 'input',
      }))
      if (sourceDataInputs.some((input) => input.name?.includes('/'))) {
        notes.push('Folder selections were restored as individual file inputs.')
      }

      outputRows.value = []
      for (const output of source.outputs ?? []) {
        const parsed = parseS3Url(output.url)
        if (!parsed) {
          notes.push(`The output destination ${output.url} is not an s3:// URL and was not restored.`)
          continue
        }
        outputRows.value.push({
          bucket: parsed.bucket,
          path: parsed.key,
          containerPath: captureContainerPath(output),
          keyTouched: true,
        })
      }

      // Script content: re-fetch the staged object; without S3 access the
      // editor keeps the runtime template.
      const scriptRef = match.scriptInput.url ? parseS3Url(match.scriptInput.url) : null
      if (scriptRef && s3.hasActiveKey.value && s3.endpoint.value) {
        try {
          const text = await s3.getObjectText(scriptRef.bucket, scriptRef.key)
          const extracted =
            match.runtime.id === 'python-uv' ? extractInlineDependencies(text) : { script: text, dependencies: [] }
          script.value = extracted.script
          dependencies.value = extracted.dependencies
          selectedScript.value = { bucket: scriptRef.bucket, key: scriptRef.key, content: text }
          stagingBucket.value = scriptRef.bucket
          for (const dependency of extracted.dependencies) void verifyDependency(dependency)
        } catch (err) {
          notes.push(`The script content could not be loaded from ${match.scriptInput.url} (${errorMessage(err)}); the editor shows the template.`)
        }
      } else if (scriptRef) {
        notes.push('S3 credentials are required to restore the script content; the editor shows the template.')
      } else {
        notes.push('The original script is not an s3:// object, so its content could not be restored.')
      }

      if (match.runtime.id === 'deno') {
        const configInput = (source.inputs ?? []).find((input) => input.path === dependencyConfigPath.value)
        const configRef = configInput?.url ? parseS3Url(configInput.url) : null
        if (configRef && s3.hasActiveKey.value && s3.endpoint.value) {
          try {
            const deps = dependenciesFromDenoConfig(await s3.getObjectText(configRef.bucket, configRef.key))
            dependencies.value = deps
            for (const dependency of deps) void verifyDependency(dependency)
          } catch {
            notes.push('The npm dependency list (deno.json) could not be restored.')
          }
        } else if (configInput) {
          notes.push('The npm dependency list (deno.json) could not be restored.')
        }
      }

      rerunSource.value = { id, name: source.name || id }
      rerunNotes.value = notes
      // Land on Script & data unless the URL already pins a step (refresh).
      if (!route.query.step) goStep(1)
    } catch (err) {
      rerunError.value = errorMessage(err)
    } finally {
      rerunLoading.value = false
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
    runtimeId,
    runtime,
    script,
    editorTab,
    dependencies,
    dependencyDraft,
    groupId,
    groupOptions,
    placementLabels,
    inputs,
    stagingBucket,
    outputRows,
    inputDialogOpen,
    credentialDialogOpen,
    inputMountDefault,
    workdir,
    activeWorkdir,
    workdirNotice,
    workdirValid,
    setWorkdir,
    runId,
    defaultScriptKey,
    scriptKey,
    setScriptKey,
    bucketOptions,
    buckets,
    bucketsLoading,
    bucketsLoaded,
    createBucket,
    creatingBucket,
    createBucketError,
    scriptContainerPath,
    normalizedScriptKey,
    scriptKeyValid,
    dependencyConfig,
    dependencyConfigKey,
    stagedScript,
    reuseSelectedScript,
    scriptUrl,
    needsStagingLocation,
    stagedFileUrl,
    commandPreview,
    task,
    reviewInputs,
    reviewOutputs,
    dependencyError,
    dependencyVerification,
    verifyDependency,
    addDependency,
    removeDependency,
    addInput,
    removeInput,
    addOutput,
    setOutputContainerPath,
    setOutputKey,
    onOutputKeyBlur,
    removeOutput,
    treeOutputs,
    onTreeInputPath,
    onTreeOutputPath,
    onTreeAddOutput,
    onTreeAddInput,
    openInputDialog,
    loadScriptOpen,
    loadScriptBusy,
    loadScriptError,
    pendingScriptPick,
    editorHasCustomContent,
    onScriptPick,
    applyScriptPick,
    stagingBucketValid,
    inputsValid,
    outputsValid,
    dataReady,
    targetProblems,
    rerunSource,
    rerunNotes,
    rerunError,
    rerunLoading,
    applyRerun,
    dismissRerun,
  }
}

export type QuickRunStore = ReturnType<typeof createStore>

const QUICK_RUN: InjectionKey<QuickRunStore> = Symbol('aruna.quickRun')

/** Creates the wizard store and provides it to the step components. */
export function useQuickRun(deps: QuickRunDeps): QuickRunStore {
  const store = createStore(deps)
  provide(QUICK_RUN, store)
  return store
}

export function injectQuickRun(): QuickRunStore {
  const store = inject(QUICK_RUN)
  if (!store) throw new Error('The quick run store is only available inside the wizard.')
  return store
}
