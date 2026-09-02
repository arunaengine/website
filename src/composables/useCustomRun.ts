// Draft state, the derived TES task and the native-versus-TES decision for the
// custom run wizard. The view keeps the wizard steps and the submission.
import { computed, inject, onMounted, provide, ref, type ComputedRef, type InjectionKey } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  TES_EXECUTOR_TAG,
  TES_GROUP_TAG,
  captureContainerPath,
  captureOutput,
  expandDataRefEntry,
  parseS3Url,
  placementTags,
  pruneTesTask,
  tesPlacementTags,
  validContainerDir,
  validContainerFilePath,
  type TesDataRefEntry,
  type TesExecutor,
  type TesOutput,
  type TesResources,
  type TesTask,
} from '@/lib/tes'
import { isWorkspaceBucket } from '@/lib/workspaces'
import {
  droppedNativeFields,
  isNativeBlocked,
  nativeSubmitRequired,
  tesFormToExecutionRequest,
  type InputPlacement,
  type NativePlacementOptions,
} from '@/lib/nativeSubmit'
import type { CollisionPolicyRequest, InputModeRequest } from '@/lib/jobs'
import { errorMessage } from '@/lib/utils'
import { targetProblems as collectTargetProblems } from '@/lib/runTarget'
import type { useAruna } from '@/composables/useAruna'
import type { useComputeDataView } from '@/composables/useComputeDataView'
import type { useRealmNodes } from '@/composables/useRealmNodes'
import type { useRunTarget } from '@/composables/useRunTarget'
import type { useS3 } from '@/composables/useS3'
import type { useTes } from '@/composables/useTes'

export interface CustomRunDeps {
  runTarget: ReturnType<typeof useRunTarget>
  // Only the bucket options come from storage here, so a caller may hand over
  // a narrower surface than the whole S3 layer.
  s3: Pick<ReturnType<typeof useS3>, 'hasActiveKey' | 'endpoint' | 'listBuckets'>
  myGroups: ReturnType<typeof useAruna>['myGroups']
  executorKinds: ReturnType<typeof useRealmNodes>['executorKinds']
  getTask: ReturnType<typeof useTes>['getTask']
  dataView: ReturnType<typeof useComputeDataView>
  realmName: ComputedRef<string>
}

export const U32_MAX = 4_294_967_295
export const MIN_RESOURCE_GB = 0.000000001
// TES converts decimal GB to bytes and accepts 1..=i64::MAX; this is the
// largest f64 GB value whose conversion does not round up past that limit.
export const MAX_RESOURCE_GB = 9_223_372_036.854_774

export const INPUT_MODE_OPTIONS = [
  { value: 'snapshot', label: 'Snapshot (default)' },
  { value: 'floating_reference', label: 'Follow current version' },
  { value: 'exact_reference', label: 'Pin an exact version' },
]
export const COLLISION_OPTIONS = [
  { value: 'reject', label: 'Reject (default)' },
  { value: 'replace', label: 'Replace' },
  { value: 'keep_existing', label: 'Keep existing' },
]
// The Tree|Table choice persists per browser (shared with quick run).
export const DATA_VIEWS = [
  { value: 'tree', label: 'Tree' },
  { value: 'table', label: 'Table' },
]

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
// type="number" inputs emit numbers; normalize before any string handling.
function text(value: string | number): string {
  return String(value).trim()
}

function createStore(deps: CustomRunDeps) {
  const { runTarget, s3, myGroups, executorKinds, getTask, dataView, realmName } = deps
  const router = useRouter()
  const route = useRoute()

  const name = ref('')
  const description = ref('')
  const groupId = ref('')
  const placementLabels = ref<Record<string, string>>({})
  // Files and folder summaries from the picker; folders expand to per-file
  // FILE inputs at task assembly (the facade accepts FILE inputs only).
  const inputs = ref<TesDataRefEntry[]>([])
  const executors = ref<TesExecutor[]>([{ image: '', command: [] }])

  // Capture-into outputs: each row captures one container path (a file, or a
  // folder when the path ends in '/') into its own bucket + key destination.
  const outputRows = ref<{ path: string; bucket: string; key: string }[]>([
    { path: '/outputs/result.txt', bucket: '', key: '' },
  ])

  // Folder captures write to a key prefix; append the missing trailing slash on
  // blur instead of rejecting it.
  function onOutputKeyBlur(row: { path: string; key: string }) {
    const key = row.key.trim()
    if (isDirCapture(row.path) && key && !key.endsWith('/')) row.key = `${key}/`
  }

  // Executor kind pin, carried as the aruna-engine.org/executor tag; it becomes
  // the request's executor_constraint. Options come from what the realm's nodes
  // advertise, with free text on a realm that has advertised nothing yet.
  const executorConstraint = ref('')
  const executorKindOptions = computed(() =>
    executorKinds.value.map((kind) => ({ value: kind, label: kind })),
  )

  const cpuCores = ref<string | number>('')
  const ramGb = ref<string | number>('')
  const diskGb = ref<string | number>('')
  const preemptible = ref(false)

  // Bucket options for the output destinations, best effort via the browser's
  // S3 session; without credentials the fields fall back to free text.
  const bucketOptions = ref<{ value: string; label: string }[]>([])
  onMounted(async () => {
    if (!s3.hasActiveKey.value || !s3.endpoint.value) return
    try {
      bucketOptions.value = (await s3.listBuckets())
        .map((b) => b.name)
        .filter((bucket) => !isWorkspaceBucket(bucket))
        .map((bucket) => ({ value: bucket, label: bucket }))
    } catch {
      bucketOptions.value = []
    }
  })

  const groupOptions = computed(() => myGroups.value.map((g) => ({ value: g.id, label: g.name })))

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
      const notes: string[] = []
      name.value = source.name ?? ''
      description.value = source.description ?? ''
      const group = source.tags?.[TES_GROUP_TAG]
      if (group) groupId.value = group
      executorConstraint.value = source.tags?.[TES_EXECUTOR_TAG] ?? ''
      placementLabels.value = tesPlacementTags(source.tags).labelConstraints

      inputs.value = (source.inputs ?? []).map((input) => ({
        kind: 'file',
        url: input.url ?? '',
        path: input.path,
        name: input.name || input.path.split('/').filter(Boolean).pop() || 'input',
      }))
      if ((source.inputs ?? []).some((input) => input.name?.includes('/'))) {
        notes.push('Folder selections were restored as individual file inputs.')
      }

      const executor = source.executors?.[0]
      if (executor) {
        executors.value = [
          {
            image: executor.image,
            command: [...executor.command],
            ...(executor.workdir ? { workdir: executor.workdir } : {}),
            ...(executor.env ? { env: { ...executor.env } } : {}),
          },
        ]
        if ((source.executors?.length ?? 0) > 1) {
          notes.push('Only the first executor was restored; a run carries one.')
        }
      }

      outputRows.value = (source.outputs ?? []).flatMap((output) => {
        const parsed = parseS3Url(output.url)
        if (!parsed) {
          notes.push(`The output destination ${output.url} is not an s3:// URL and was not restored.`)
          return []
        }
        const path = captureContainerPath(output)
        const key = isDirCapture(path) && !parsed.key.endsWith('/') ? `${parsed.key}/` : parsed.key
        return [{ path, bucket: parsed.bucket, key }]
      })

      const r = source.resources
      cpuCores.value = r?.cpu_cores != null ? String(r.cpu_cores) : ''
      ramGb.value = r?.ram_gb != null ? String(r.ram_gb) : ''
      diskGb.value = r?.disk_gb != null ? String(r.disk_gb) : ''
      preemptible.value = !!r?.preemptible

      rerunSource.value = { id, name: source.name || id }
      rerunNotes.value = notes
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

  onMounted(() => {
    const rerun = route.query.rerun
    if (typeof rerun === 'string' && rerun) void applyRerun(rerun)
  })

  const outputs = computed<TesOutput[]>(() =>
    outputRows.value.map((row) => captureOutput(row.path, row.bucket, normalizedOutputKey(row.key))),
  )

  const resources = computed<TesResources>(() => {
    const r: TesResources = {}
    const cpuRaw = text(cpuCores.value)
    const cpu = Number(cpuRaw)
    if (cpuRaw && !Number.isNaN(cpu)) r.cpu_cores = cpu
    const ramRaw = text(ramGb.value)
    const ram = Number(ramRaw)
    if (ramRaw && !Number.isNaN(ram)) r.ram_gb = ram
    const diskRaw = text(diskGb.value)
    const disk = Number(diskRaw)
    if (diskRaw && !Number.isNaN(disk)) r.disk_gb = disk
    if (preemptible.value) r.preemptible = true
    return r
  })

  const task = computed<TesTask>(() =>
    pruneTesTask({
      name: name.value,
      description: description.value,
      inputs: inputs.value.flatMap(expandDataRefEntry),
      outputs: outputs.value,
      resources: resources.value,
      executors: executors.value,
      tags: {
        [TES_GROUP_TAG]: groupId.value,
        ...(executorConstraint.value.trim() ? { [TES_EXECUTOR_TAG]: executorConstraint.value.trim() } : {}),
        ...(runTarget.local.value ? {} : placementTags(placementLabels.value)),
      },
    }),
  )

  // ── Validity ───────────────────────────────────────────────────────────────
  // The editor emits an empty argv for an empty or unparseable command line, so
  // a non-empty command with at least one real argument is the whole check.
  const executorsValid = computed(
    () =>
      executors.value.length === 1 &&
      executors.value[0].image.trim().length > 0 &&
      executors.value[0].command.length > 0 &&
      executors.value[0].command.some((argument) => argument.trim()),
  )
  const outputsValid = computed(() => {
    const rows = outputRows.value
    const validRow = (row: { path: string; bucket: string; key: string }) => {
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

  function addOutputRow() {
    outputRows.value.push({ path: '/outputs/result.txt', bucket: outputRows.value.at(-1)?.bucket ?? '', key: '' })
  }
  function removeOutputRow(i: number) {
    outputRows.value.splice(i, 1)
  }

  // ── Filesystem-tree wiring (shared component with the quick-run wizard) ────
  const inputDialogOpen = ref(false)
  const inputMountDefault = ref('/inputs/')
  const treeOutputs = computed(() =>
    outputRows.value.map((row) => ({ containerPath: row.path, destination: outputDestination(row) })),
  )
  function addInputEntry(entry: TesDataRefEntry) {
    inputs.value = [...inputs.value, entry]
  }
  function removeInputEntry(index: number) {
    inputs.value = inputs.value.filter((_, i) => i !== index)
  }
  function onTreeInputPath(index: number, path: string) {
    inputs.value = inputs.value.map((entry, i) =>
      i === index ? (entry.kind === 'folder' ? { ...entry, basePath: path } : { ...entry, path }) : entry,
    )
  }
  function onTreeOutputPath(index: number, path: string) {
    const row = outputRows.value[index]
    if (row) row.path = path
  }
  function onTreeAddOutput(containerDir: string) {
    outputRows.value.push({ path: containerDir, bucket: outputRows.value.at(-1)?.bucket ?? '', key: '' })
  }
  function onTreeAddInput(containerDir: string) {
    inputMountDefault.value = containerDir
    inputDialogOpen.value = true
  }
  function openInputDialog() {
    inputMountDefault.value = '/inputs/'
    inputDialogOpen.value = true
  }

  // ── Advanced placement ─────────────────────────────────────────────────────
  // Options the GA4GH task interface cannot carry. Setting any of them switches
  // the submission to the native jobs API rather than silently dropping them.
  const inputPlacements = ref<Record<string, InputPlacement>>({})
  const collisionPolicy = ref<CollisionPolicyRequest>('reject')

  function placementFor(containerPath: string): InputPlacement {
    return inputPlacements.value[containerPath] ?? { mode: 'snapshot' }
  }
  function setInputMode(containerPath: string, mode: InputModeRequest) {
    const current = placementFor(containerPath)
    const next = { ...current, mode }
    // A version id only belongs to an exact pin; clearing it here keeps the
    // form from carrying a value the backend would refuse.
    if (mode !== 'exact_reference') delete next.versionId
    inputPlacements.value = { ...inputPlacements.value, [containerPath]: next }
  }
  function setInputVersion(containerPath: string, versionId: string) {
    inputPlacements.value = {
      ...inputPlacements.value,
      [containerPath]: { ...placementFor(containerPath), versionId },
    }
  }

  // The expanded TES inputs, which is what the native request is built from: a
  // folder pick contributes one row per file, so each gets its own mode.
  const advancedInputs = computed(() => task.value.inputs ?? [])
  const hasFolderCapture = computed(() => outputRows.value.some((row) => isDirCapture(row.path)))

  const placement = computed<NativePlacementOptions>(() => ({
    inputs: inputPlacements.value,
    collisionPolicy: collisionPolicy.value,
  }))

  const targetProblems = computed(() =>
    collectTargetProblems({
      target: runTarget.local.value ? 'local' : 'realm',
      executorConstraint: executorConstraint.value,
      backend: runTarget.compute.value?.backend,
      inputModes: advancedInputs.value.map((input) => placementFor(input.path).mode),
      realmInputsMissingVersion: advancedInputs.value.some(
        (input) => !input.source_node_id?.trim() || !input.version_id?.trim(),
      ),
      cpuCores: resources.value.cpu_cores,
      ramBytes:
        resources.value.ram_gb === undefined
          ? undefined
          : Math.floor(resources.value.ram_gb * 1_000_000_000),
      limits: runTarget.compute.value?.limits ?? null,
    }),
  )

  const nativeMapping = computed(() =>
    tesFormToExecutionRequest({
      groupId: groupId.value,
      task: task.value,
      executorConstraint: executorConstraint.value,
      placement: placement.value,
    }),
  )
  // Only a draft that cannot be expressed natively switches the section off; a
  // half-filled native field is a fixable error, not a capability limit.
  const nativeUnsupported = computed(() =>
    isNativeBlocked(nativeMapping.value) && nativeMapping.value.kind === 'unsupported'
      ? nativeMapping.value.blocked
      : null,
  )
  const nativeInvalid = computed(() =>
    isNativeBlocked(nativeMapping.value) && nativeMapping.value.kind === 'invalid'
      ? nativeMapping.value.blocked
      : null,
  )
  // A run on this computer is always the native request: the device accepts the
  // target there, and the TES facade is the realm's surface.
  const useNative = computed(
    () => runTarget.local.value || (!nativeUnsupported.value && nativeSubmitRequired(placement.value)),
  )
  const nativeDropped = computed(() => (useNative.value ? droppedNativeFields(task.value) : []))

  return {
    runTarget,
    realmName,
    dataView,
    name,
    description,
    groupId,
    groupOptions,
    placementLabels,
    inputs,
    executors,
    outputRows,
    executorConstraint,
    executorKindOptions,
    cpuCores,
    ramGb,
    diskGb,
    preemptible,
    bucketOptions,
    onOutputKeyBlur,
    rerunSource,
    rerunNotes,
    rerunError,
    rerunLoading,
    applyRerun,
    dismissRerun,
    outputs,
    resources,
    task,
    executorsValid,
    outputsValid,
    cpuCoresValid,
    ramGbValid,
    diskGbValid,
    addOutputRow,
    removeOutputRow,
    inputDialogOpen,
    inputMountDefault,
    treeOutputs,
    addInputEntry,
    removeInputEntry,
    onTreeInputPath,
    onTreeOutputPath,
    onTreeAddOutput,
    onTreeAddInput,
    openInputDialog,
    inputPlacements,
    collisionPolicy,
    placementFor,
    setInputMode,
    setInputVersion,
    advancedInputs,
    hasFolderCapture,
    placement,
    targetProblems,
    nativeUnsupported,
    nativeInvalid,
    useNative,
    nativeDropped,
  }
}

export type CustomRunStore = ReturnType<typeof createStore>

export const CUSTOM_RUN: InjectionKey<CustomRunStore> = Symbol('aruna.customRun')

/**
 * Creates the wizard store and provides it to the step components. A store
 * provided further up (the compute tutorial seeds one) is adopted instead, so
 * the wizard runs unchanged against a prepared draft.
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
  if (!store) throw new Error('The custom run store is only available inside the wizard.')
  return store
}
