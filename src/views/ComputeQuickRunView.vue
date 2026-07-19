<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import WizardSteps from '@/components/onboarding/WizardSteps.vue'
import TaskJsonPreview from '@/components/compute/TaskJsonPreview.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import QuickRunResult from '@/components/compute/QuickRunResult.vue'
import { asyncChunkError } from '@/lib/chunk-recovery'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useS3 } from '@/composables/useS3'
import {
  TES_GROUP_TAG,
  TES_IDEMPOTENCY_TAG,
  expandDataRefEntry,
  pruneTesTask,
  validContainerDir,
  validContainerFilePath as validContainerPath,
  type TesDataRefEntry,
  type TesInput,
  type TesOutput,
  type TesTask,
} from '@/lib/tes'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { fetchWithTimeout } from '@/lib/fetch'
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  CornerDownRight,
  Cpu,
  FileText,
  Folder,
  FolderOpen,
  KeyRound,
  ListPlus,
  LogIn,
  Plus,
  X,
} from '@lucide/vue'

// CodeMirror lands on its own async chunk, mounted only at the script step.
const ScriptEditor = defineAsyncComponent({
  loader: () => import('@/components/compute/ScriptEditor.vue'),
  onError: asyncChunkError,
})

const router = useRouter()
const route = useRoute()
const { tesEnabled, busy, createTask } = useTes()
const { currentUser, myGroups } = useAruna()
const { signIn, stage } = useAuth()
const s3 = useS3()

const signingIn = computed(() => stage.value === 'redirecting')
function startSignIn() {
  void signIn({ redirectTo: '/app/compute/quick' })
}
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ── Runtimes (tagged upstream images) ────────────────────────────────────────
interface Runtime {
  id: 'python-uv' | 'deno' | 'bash'
  label: string
  hint: string
  image: string
  /** Argv prefix; the staged script path is appended as the last argument. */
  command: string[]
  /** Extra executor environment (e.g. cache dirs inside the writable /work). */
  env?: Record<string, string>
  file: string
  lang: 'python' | 'javascript' | 'text'
  contentType: string
  template: string
}
const RUNTIMES: Runtime[] = [
  {
    id: 'python-uv',
    label: 'Python',
    hint: 'PyPI dependencies managed by uv.',
    image: 'ghcr.io/astral-sh/uv:python3.13-bookworm-slim',
    command: ['uv', 'run', '--no-project'],
    env: { UV_CACHE_DIR: '/work/.uv-cache' },
    file: 'script.py',
    lang: 'python',
    contentType: 'text/x-python',
    template: 'print("hello from aruna")\n',
  },
  {
    id: 'deno',
    label: 'JavaScript / TypeScript',
    hint: 'npm dependencies resolved by Deno.',
    image: 'denoland/deno:alpine-2.9.3',
    command: ['deno', 'run', '-A'],
    env: { DENO_DIR: '/work/.deno-cache' },
    file: 'script.ts',
    lang: 'javascript',
    contentType: 'text/typescript',
    template: 'console.log("hello from aruna");\n',
  },
  {
    id: 'bash',
    label: 'Bash',
    hint: 'Plain shell, no extra tooling.',
    image: 'bash:5.2',
    command: ['bash'],
    file: 'script.sh',
    lang: 'text',
    contentType: 'text/x-shellscript',
    template: 'echo "hello from aruna"\n',
  },
]
const TES_NETWORK_TAG = 'aruna-engine.org/network'

// One combined "Script & data" step: the selected data references are listed
// with their editable container mount paths (defaulting to /work/in and
// /work/out) right next to the editor, so container paths are visible while
// the script is written.
const WIZARD_STEPS = ['Runtime', 'Script & data', 'Review']
const REVIEW_STEP = 2
// The step lives in ?step=N so browser back/forward walks the wizard instead
// of leaving it.
const step = computed(() => {
  const raw = Number(route.query.step)
  return Number.isInteger(raw) && raw > 0 && raw < WIZARD_STEPS.length ? raw : 0
})
function goStep(target: number) {
  void router.push({ query: { ...route.query, step: target > 0 ? String(target) : undefined } })
}

// ── Draft ────────────────────────────────────────────────────────────────────
const runtimeId = ref<Runtime['id']>('python-uv')
const runtime = computed(() => RUNTIMES.find((r) => r.id === runtimeId.value) as Runtime)
const script = ref(RUNTIMES[0].template)
const editorTab = ref('work')
const dependencies = ref<string[]>([])
const dependencyDraft = ref('')
const taskName = ref('quick-run')
const groupId = ref('')
// Files and folder summaries from the picker; folders expand to per-file
// FILE inputs only at task assembly (the facade accepts FILE inputs only).
const inputs = ref<TesDataRefEntry[]>([])
// The script needs an S3 home before the run starts; outputs pick their own
// bucket and key per row. The destination key defaults to quickruns/<basename>
// and tracks the captured container path until the key is edited directly.
const stagingBucket = ref('')
const outputRows = ref<{ bucket: string; path: string; containerPath: string; keyTouched: boolean }[]>([])
const inputDialogOpen = ref(false)
const credentialDialogOpen = ref(false)

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
watch(step, (s) => {
  if (s === REVIEW_STEP) runId.value = crypto.randomUUID()
})

// ── Derived task ─────────────────────────────────────────────────────────────
const groupOptions = computed(() => myGroups.value.map((g) => ({ value: g.id, label: g.name })))
const bucketOptions = computed(() => buckets.value.map((b) => ({ value: b, label: b })))

// The container path is tied to the runtime's file name, not to the S3 key
// basename: the TES input materializes the object at `path`, so the exec
// command works no matter what the uploaded key is called.
const scriptContainerPath = computed(() => `/work/${runtime.value.file}`)
const normalizedScriptKey = computed(() => scriptKey.value.trim())
// A canonical object key: no leading slash, no empty or dot segments, and a
// non-empty basename (a key ending in / has an empty last segment).
const scriptKeyValid = computed(() =>
  normalizedScriptKey.value.split('/').every((segment) => segment && segment !== '.' && segment !== '..'),
)
const scriptUrl = computed(() => `s3://${stagingBucket.value.trim()}/${normalizedScriptKey.value}`)
const dependencyConfigPath = '/work/deno.json'
// The generated deno.json sits next to the script object, whatever directory
// the key names.
const dependencyConfigKey = computed(() => {
  const key = normalizedScriptKey.value
  return `${key.slice(0, key.lastIndexOf('/') + 1)}deno.json`
})
const dependencyConfigUrl = computed(
  () => `s3://${stagingBucket.value.trim()}/${dependencyConfigKey.value}`,
)

function npmPackageName(spec: string): string {
  if (!spec.startsWith('@')) return spec.split('@')[0]
  const slash = spec.indexOf('/')
  const version = spec.indexOf('@', slash + 1)
  return version === -1 ? spec : spec.slice(0, version)
}

const dependencyConfig = computed(() => {
  if (runtimeId.value !== 'deno' || !dependencies.value.length) return null
  return JSON.stringify(
    {
      imports: Object.fromEntries(
        dependencies.value.map((dependency) => [npmPackageName(dependency), `npm:${dependency}`]),
      ),
    },
    null,
    2,
  )
})
function tomlString(value: string): string {
  return JSON.stringify(value)
}
const stagedScript = computed(() => {
  if (runtimeId.value !== 'python-uv' || !dependencies.value.length) return script.value
  const dependencyLines = dependencies.value.map((dependency) => `#   ${tomlString(dependency)},`).join('\n')
  return `# /// script\n# requires-python = ">=3.13"\n# dependencies = [\n${dependencyLines}\n# ]\n# ///\n${script.value}`
})
const executorCommand = computed(() => {
  return dependencyConfig.value
    ? [...runtime.value.command, `--config=${dependencyConfigPath}`]
    : runtime.value.command
})
const commandPreview = computed(() => `${executorCommand.value.join(' ')} ${scriptContainerPath.value}`)

const scriptInput = computed<TesInput>(() => ({
  name: runtime.value.file,
  description: 'Quick-run script uploaded by the portal',
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
        path: dependencyConfigPath,
        type: 'FILE',
      }
    : null,
)
const dataInputs = computed<TesInput[]>(() => inputs.value.flatMap(expandDataRefEntry))

function normalizedOutputKey(path: string): string {
  return path.trim().replace(/^\/+/, '')
}
function outputBasename(path: string): string {
  return normalizedOutputKey(path).split('/').filter(Boolean).pop() ?? ''
}
// A captured container path ending in '/' means a DIRECTORY output: the run
// uploads everything the script wrote below it, to a destination key prefix.
function isDirCapture(path: string): boolean {
  return path.trim().endsWith('/')
}
const declaredOutputs = computed<TesOutput[]>(() =>
  outputRows.value
    .filter((row) => row.bucket.trim() && outputBasename(row.path) && row.containerPath.trim())
    .map((row) => ({
      url: `s3://${row.bucket.trim()}/${normalizedOutputKey(row.path)}`,
      path: row.containerPath.trim(),
      type: isDirCapture(row.containerPath) ? ('DIRECTORY' as const) : ('FILE' as const),
    })),
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
        workdir: '/work',
        env: runtime.value.env,
      },
    ],
    tags: {
      [TES_GROUP_TAG]: groupId.value,
      [TES_IDEMPOTENCY_TAG]: runId.value,
      ...(dependencies.value.length ? { [TES_NETWORK_TAG]: 'open' } : {}),
    },
  }),
)

// ── Dependencies ─────────────────────────────────────────────────────────────
const dependencyError = computed(() => {
  const dependency = dependencyDraft.value.trim()
  if (!dependency) return null
  if (dependencies.value.some((entry) => entry.toLowerCase() === dependency.toLowerCase())) {
    return 'This dependency is already in the list.'
  }
  if (
    runtimeId.value === 'python-uv' &&
    (dependency.startsWith('-') || !/^[a-z0-9][a-z0-9._-]*(?:\[[a-z0-9_,.-]+\])?(?:\s*(?:===|==|~=|!=|<=|>=|<|>).+|\s*@\s*\S+)?(?:\s*;.+)?$/i.test(dependency))
  ) {
    return 'Use a PyPI requirement such as requests>=2.'
  }
  if (
    runtimeId.value === 'deno' &&
    !/^(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)(?:@[^\s]+)?$/i.test(dependency)
  ) {
    return 'Use an npm package such as chalk or @scope/package@1.'
  }
  if (
    runtimeId.value === 'deno' &&
    dependencies.value.some(
      (entry) => npmPackageName(entry).toLowerCase() === npmPackageName(dependency).toLowerCase(),
    )
  ) {
    return 'This npm package already has a selected version.'
  }
  return null
})

type DependencyVerification = 'checking' | 'available' | 'not-found' | 'unverified'
interface DependencyVerificationResult {
  state: DependencyVerification
  detail: string
}
const dependencyVerification = ref<Record<string, DependencyVerificationResult>>({})

function pythonPackage(spec: string): { name: string; constraint: string } | null {
  const match = spec.match(/^([a-z0-9][a-z0-9._-]*)(?:\[[^\]]+\])?\s*(.*)$/i)
  return match ? { name: match[1], constraint: match[2].trim() } : null
}

async function verifyDependency(dependency: string): Promise<void> {
  const checkedRuntime = runtimeId.value
  dependencyVerification.value = {
    ...dependencyVerification.value,
    [dependency]: { state: 'checking', detail: 'Checking registry metadata…' },
  }
  let result: DependencyVerificationResult
  try {
    if (runtimeId.value === 'python-uv') {
      const parsed = pythonPackage(dependency)
      if (!parsed) throw new Error('The requirement could not be inspected in the browser.')
      const response = await fetchWithTimeout(`https://pypi.org/pypi/${encodeURIComponent(parsed.name)}/json`, {}, 5_000)
      if (response.status === 404) {
        result = { state: 'not-found', detail: `${parsed.name} was not found on PyPI.` }
      } else if (!response.ok) {
        throw new Error(`PyPI returned ${response.status}.`)
      } else {
        const metadata = (await response.json()) as { releases?: Record<string, unknown> }
        const exact = parsed.constraint.match(/^===?\s*([^,;\s]+)$/)
        if (!parsed.constraint) {
          result = { state: 'available', detail: 'Package exists on PyPI.' }
        } else if (exact) {
          result = metadata.releases && exact[1] in metadata.releases
            ? { state: 'available', detail: `Version ${exact[1]} exists on PyPI.` }
            : { state: 'not-found', detail: `Version ${exact[1]} was not found on PyPI.` }
        } else {
          result = { state: 'unverified', detail: 'Package exists; this version constraint needs uv to resolve it.' }
        }
      }
    } else {
      const name = npmPackageName(dependency)
      const specifier = dependency.slice(name.length + (dependency.length > name.length ? 1 : 0))
      const response = await fetchWithTimeout(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {}, 5_000)
      if (response.status === 404) {
        result = { state: 'not-found', detail: `${name} was not found on npm.` }
      } else if (!response.ok) {
        throw new Error(`npm returned ${response.status}.`)
      } else {
        const metadata = (await response.json()) as {
          versions?: Record<string, unknown>
          'dist-tags'?: Record<string, string>
        }
        if (!specifier) {
          result = { state: 'available', detail: 'Package exists on npm.' }
        } else if (metadata.versions && specifier in metadata.versions) {
          result = { state: 'available', detail: `Version ${specifier} exists on npm.` }
        } else if (metadata['dist-tags'] && specifier in metadata['dist-tags']) {
          result = { state: 'available', detail: `Tag ${specifier} exists on npm.` }
        } else if (/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i.test(specifier)) {
          result = { state: 'not-found', detail: `Version ${specifier} was not found on npm.` }
        } else {
          result = { state: 'unverified', detail: 'Package exists; this version range needs Deno to resolve it.' }
        }
      }
    }
  } catch (err) {
    result = {
      state: 'unverified',
      detail: err instanceof Error ? `Registry check unavailable: ${err.message}` : 'Registry check unavailable.',
    }
  }
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

// ── Inputs / outputs editing ─────────────────────────────────────────────────
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
  const containerPath = '/work/out/result.txt'
  outputRows.value.push({
    bucket: outputRows.value.at(-1)?.bucket || stagingBucket.value.trim() || buckets.value[0] || '',
    containerPath,
    path: `quickruns/${outputBasename(containerPath)}`,
    keyTouched: false,
  })
}
type OutputRow = { bucket: string; path: string; containerPath: string; keyTouched: boolean }
// A file capture needs a plain container file path; a folder capture (trailing
// slash) an absolute directory path other than '/'.
function validOutputContainerPath(path: string): boolean {
  const value = path.trim()
  if (value.endsWith('/')) return value !== '/' && validContainerDir(value)
  return validContainerPath(value)
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
function outputDestination(row: { bucket: string; path: string }): string {
  return `s3://${row.bucket.trim() || '<bucket>'}/${normalizedOutputKey(row.path) || '<path>'}`
}
function removeOutput(i: number) {
  outputRows.value.splice(i, 1)
}

// ── Load existing script ─────────────────────────────────────────────────────
// Reuses a script object from any bucket: its text is fetched into the editor
// (the submit path still uploads the canonical per-run copy). Single-object
// pick via the browser panel's default select mode; folders only navigate.
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

// ── Buckets ──────────────────────────────────────────────────────────────────
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
})
watch([currentUser, () => s3.hasActiveKey.value, myGroups], initDefaults)

// ── Validity ─────────────────────────────────────────────────────────────────
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
    stagingBucketValid.value &&
    scriptKeyValid.value,
)
const canContinue = computed(() => {
  switch (step.value) {
    case 1:
      return script.value.trim().length > 0 && dataReady.value && inputsValid.value && outputsValid.value
    default:
      return true
  }
})
function next() {
  if (canContinue.value && step.value < WIZARD_STEPS.length - 1) goStep(step.value + 1)
}
// The first step's Back leaves the wizard, and the button says so.
function back() {
  if (step.value > 0) goStep(step.value - 1)
  else void router.push({ name: 'compute' })
}

// ── Submit ───────────────────────────────────────────────────────────────────
const submitting = ref(false)
const submitError = ref<string | null>(null)
const submittedTaskId = ref<string | null>(null)
// Snapshot of the declared destinations for the result view.
const submittedOutputs = ref<{ bucket: string; key: string; path: string }[]>([])

async function submit() {
  submitError.value = null
  submitting.value = true
  try {
    const uploads = [
      s3.putTextObject(stagingBucket.value.trim(), normalizedScriptKey.value, stagedScript.value, runtime.value.contentType),
    ]
    if (dependencyConfig.value) {
      uploads.push(
        s3.putTextObject(
          stagingBucket.value.trim(),
          dependencyConfigKey.value,
          dependencyConfig.value,
          'application/json',
        ),
      )
    }
    await Promise.all(uploads)
    const created = await createTask(task.value)
    submittedOutputs.value = outputRows.value.map((row) => ({
      bucket: row.bucket.trim(),
      key: normalizedOutputKey(row.path),
      path: row.containerPath.trim(),
    }))
    submittedTaskId.value = created.id
  } catch (err) {
    submitError.value = isTesUnsupported(err)
      ? `This node does not expose the TES endpoint. ${errorMessage(err)}`
      : errorMessage(err)
  } finally {
    submitting.value = false
  }
}
function runAnother() {
  submittedTaskId.value = null
  submitError.value = null
  submittedOutputs.value = []
  goStep(0)
  runId.value = crypto.randomUUID()
}
</script>

<template>
  <div>
    <PageHeader title="Quick run" description="Run a Python, JavaScript or Bash script with optional package dependencies without writing a TES task by hand.">
      <template #actions>
        <RouterLink :to="{ name: 'compute' }">
          <Button variant="outline" size="sm"><ArrowLeft class="h-4 w-4" /> Back to Compute</Button>
        </RouterLink>
      </template>
    </PageHeader>

    <!-- Gate 1: feature disabled -->
    <div v-if="!tesEnabled" class="container py-8">
      <EmptyState
        title="Compute is not enabled"
        description="Set features.tes to true in portal-config.json for this deployment; the Compute surface then targets any node that exposes the GA4GH TES endpoint."
      >
        <template #icon><Cpu class="h-7 w-7" /></template>
      </EmptyState>
    </div>

    <!-- Gate 2: not signed in -->
    <div v-else-if="!currentUser" class="container py-8">
      <section class="surface mx-auto max-w-xl p-8 text-center">
        <Cpu class="mx-auto h-8 w-8 text-muted-foreground/70" />
        <h2 class="mt-3 font-display text-base font-semibold text-aruna-navy">Sign in to run a script</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">Submitting GA4GH TES tasks is an authenticated operation.</p>
        <Button class="mt-4" size="sm" :disabled="signingIn" @click="startSignIn"><LogIn class="h-3.5 w-3.5" /> Sign in</Button>
      </section>
    </div>

    <!-- Result -->
    <div v-else-if="submittedTaskId" class="container space-y-6 py-8">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-base font-semibold text-aruna-navy">Run submitted</h2>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="router.push({ name: 'compute' })">
            <ArrowLeft class="h-3.5 w-3.5" /> Back to Compute
          </Button>
          <Button size="sm" title="Starts the wizard again with this run's script and data settings" @click="runAnother">
            <ListPlus class="h-4 w-4" /> Run again
          </Button>
        </div>
      </div>
      <QuickRunResult :task-id="submittedTaskId" :outputs="submittedOutputs" />
    </div>

    <!-- Wizard -->
    <div v-else class="container space-y-6 py-8">
      <WizardSteps :steps="WIZARD_STEPS" :current="step" />

      <section class="surface space-y-5 p-6">
        <!-- Step 1: Runtime -->
        <div v-if="step === 0" class="space-y-3">
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Runtime</div>
          <div class="grid gap-3 sm:grid-cols-3">
            <button
              v-for="rt in RUNTIMES"
              :key="rt.id"
              type="button"
              class="rounded-lg border p-4 text-left transition-colors"
              :class="runtimeId === rt.id ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'border-border hover:bg-muted/40'"
              @click="runtimeId = rt.id"
            >
              <div class="text-sm font-semibold text-foreground">{{ rt.label }}</div>
              <div class="mt-0.5 text-[11px] text-muted-foreground">{{ rt.hint }}</div>
              <div class="mt-1 truncate font-mono text-[11px] text-muted-foreground" :title="rt.image">{{ rt.image }}</div>
            </button>
          </div>
          <p class="text-[11px] text-muted-foreground">
            The script runs as <code class="rounded bg-muted px-1 font-mono">{{ commandPreview }}</code> in a fresh container.
          </p>
        </div>

        <!-- Step 2: Script & data — mounts sit next to the editor so container
             paths are visible while the script is written. -->
        <div v-else-if="step === 1" class="space-y-5">
          <!-- Credentials gate -->
          <div v-if="!s3.endpoint.value" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            This node does not advertise an S3 endpoint, so the portal cannot stage the script. Use the full task form to reference an existing script.
          </div>
          <div v-else-if="!s3.hasActiveKey.value" class="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
            <p class="flex items-center gap-2 font-medium text-foreground"><KeyRound class="h-3.5 w-3.5" /> S3 credentials are required to stage the script and browse data.</p>
            <Button variant="outline" size="sm" @click="credentialDialogOpen = true"><Plus class="size-3.5" /> Create credentials</Button>
          </div>

          <div v-if="s3.endpoint.value && s3.hasActiveKey.value" class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="text-xs font-medium text-foreground">Group</label>
              <Select v-model="groupId" :options="groupOptions" placeholder="Select a group" class="mt-1" />
              <p class="mt-1 text-[11px] text-muted-foreground">Owns the run and receives its Process Run crate.</p>
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Script location <span class="text-destructive">*</span></label>
              <div class="mt-1 flex items-center gap-2">
                <Select v-if="bucketOptions.length" v-model="stagingBucket" :options="bucketOptions" placeholder="Select a bucket" class="w-40 shrink-0" />
                <Input
                  v-else
                  v-model="stagingBucket"
                  class="w-40 shrink-0 font-mono"
                  :placeholder="bucketsLoading ? 'Loading buckets…' : 'my-results'"
                  :invalid="stagingBucket.trim() && !stagingBucketValid ? 'error' : undefined"
                />
                <Input
                  :model-value="scriptKey"
                  class="min-w-0 flex-1 font-mono"
                  :placeholder="defaultScriptKey"
                  aria-label="Script object key"
                  :invalid="!scriptKeyValid ? 'error' : undefined"
                  @update:model-value="setScriptKey(String($event))"
                />
              </div>
              <p v-if="stagingBucket.trim() && !stagingBucketValid" class="mt-1 text-[11px] text-destructive">
                This bucket does not exist. The script can only be staged into one of your buckets.
              </p>
              <p v-else-if="bucketsLoaded && !buckets.length" class="mt-1 text-[11px] text-destructive">
                You have no buckets yet. Create one in Data first.
              </p>
              <p v-else-if="!scriptKeyValid" class="mt-1 text-[11px] text-destructive">
                Use an object key without a leading slash or empty segments, ending in a file name.
              </p>
              <p v-else class="mt-1 truncate font-mono text-[11px] text-muted-foreground" :title="scriptUrl">{{ scriptUrl }}</p>
              <p class="mt-1 text-[11px] text-muted-foreground">
                The default key keeps each run's copy separate, so reruns never overwrite a script an earlier task references.
              </p>
            </div>
          </div>

          <Tabs v-model="editorTab">
            <TabsList>
              <TabsTrigger value="work">Script &amp; data</TabsTrigger>
              <TabsTrigger v-if="runtimeId !== 'bash'" value="dependencies">Dependencies ({{ dependencies.length }})</TabsTrigger>
            </TabsList>

            <TabsContent value="work" class="mt-4">
              <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
            <!-- Script editor -->
            <div class="min-w-0 space-y-2">
              <div class="flex items-center justify-between gap-2">
                <label class="text-xs font-medium text-foreground">Script <span class="font-mono text-muted-foreground">({{ runtime.file }})</span></label>
                <div class="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" @click="loadScriptOpen = true">
                    <FolderOpen class="h-3.5 w-3.5" /> Load existing script
                  </Button>
                  <Button variant="ghost" size="sm" @click="script = runtime.template">Reset to template</Button>
                </div>
              </div>
              <Suspense>
                <ScriptEditor v-model="script" :language="runtime.lang" />
                <template #fallback>
                  <div class="grid h-40 place-items-center rounded-md border border-input bg-field text-xs text-muted-foreground">Loading editor…</div>
                </template>
              </Suspense>
              <p v-if="!script.trim()" class="text-[11px] text-destructive">The script cannot be empty.</p>
              <p class="text-[11px] text-muted-foreground">
                Runs as <code class="rounded bg-muted px-1 font-mono">{{ commandPreview }}</code> in a fresh container.
              </p>
            </div>

            <!-- Data references with their resolved container mount paths -->
            <div class="min-w-0 space-y-4">
              <section class="surface-muted space-y-2.5 p-3.5">
                <div>
                  <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ArrowDownToLine class="h-3.5 w-3.5 text-primary" /> Input data
                  </div>
                  <p class="mt-1 text-[11px] text-muted-foreground">
                    Staged read-only before the script starts, by default under <code class="rounded bg-muted px-1 font-mono">/work/in/</code>. Paths are editable.
                  </p>
                </div>
                <div v-if="inputs.length" class="space-y-1.5">
                  <!-- Shared row grid with the output section: flexible content
                       column plus a fixed 1.25rem action column so control
                       right edges and remove buttons line up across both. -->
                  <div v-for="(input, i) in inputs" :key="i" class="surface-inline grid grid-cols-[minmax(0,1fr)_1.25rem] gap-x-1.5 p-2 text-xs">
                    <div v-if="input.kind === 'folder'" class="min-w-0 space-y-1">
                      <Input
                        v-model="input.basePath"
                        class="h-7 font-mono text-xs"
                        aria-label="Container base path"
                        :invalid="!validContainerDir(input.basePath) ? 'error' : undefined"
                      />
                      <div class="flex min-w-0 items-center gap-1 font-mono text-[10px] text-muted-foreground" :title="`s3://${input.bucket}/${input.prefix}`">
                        <Folder class="h-3 w-3 shrink-0 text-primary/70" />
                        <span class="truncate">{{ input.name }}/ · {{ input.files.length }} file{{ input.files.length === 1 ? '' : 's' }} · s3://{{ input.bucket }}/{{ input.prefix }}</span>
                      </div>
                    </div>
                    <div v-else class="min-w-0 space-y-1">
                      <Input
                        v-model="input.path"
                        class="h-7 font-mono text-xs"
                        aria-label="Container path"
                        :invalid="!validContainerPath(input.path.trim()) ? 'error' : undefined"
                      />
                      <div class="truncate font-mono text-[10px] text-muted-foreground" :title="input.url">{{ input.url }}</div>
                    </div>
                    <Button variant="ghost" size="icon-sm" class="mt-1 h-5 w-5 self-start" aria-label="Remove input" @click="removeInput(i)"><X class="size-3" /></Button>
                  </div>
                  <p v-if="!inputsValid" class="text-[11px] text-destructive">
                    Each input needs an absolute canonical container path (folders a base directory), unique across all staged files.
                  </p>
                </div>
                <p v-else class="text-[11px] text-muted-foreground">No input data. Added files are staged into the container, by default under <code class="rounded bg-muted px-1 font-mono">/work/in/</code>.</p>
                <Button variant="outline" size="sm" @click="inputDialogOpen = true"><ListPlus class="size-3.5" /> Add input</Button>
              </section>

              <section class="surface-muted space-y-2.5 p-3.5">
                <div>
                  <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ArrowUpFromLine class="h-3.5 w-3.5 text-primary" /> Output data
                  </div>
                  <p class="mt-1 text-[11px] text-muted-foreground">
                    Captures files or folders the script writes, by default under <code class="rounded bg-muted px-1 font-mono">/work/out/</code>, into a bucket after the run. A container path ending in / captures everything below it. stdout and stderr are always captured.
                  </p>
                </div>
                <div v-if="outputRows.length" class="space-y-1.5">
                  <!-- Same row grid as the input section above; every control
                       line ends at the shared content-column edge. -->
                  <div v-for="(row, i) in outputRows" :key="i" class="surface-inline grid grid-cols-[minmax(0,1fr)_1.25rem] gap-x-1.5 p-2 text-xs">
                    <div class="min-w-0 space-y-1.5">
                      <div>
                        <label class="text-[10px] font-medium text-muted-foreground">Capture</label>
                        <div class="mt-0.5 flex items-center gap-1.5">
                          <Input
                            :model-value="row.containerPath"
                            class="h-7 min-w-0 flex-1 font-mono text-xs"
                            placeholder="/work/out/result.txt"
                            aria-label="Container path to capture"
                            :invalid="!validOutputContainerPath(row.containerPath) ? 'error' : undefined"
                            @update:model-value="setOutputContainerPath(row, String($event))"
                          />
                          <Badge variant="outline" class="shrink-0 gap-1 text-[10px]">
                            <component :is="isDirCapture(row.containerPath) ? Folder : FileText" class="h-3 w-3" />
                            {{ isDirCapture(row.containerPath) ? 'Folder' : 'File' }}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <label class="text-[10px] font-medium text-muted-foreground">into</label>
                        <div class="mt-0.5 flex items-center gap-1.5">
                          <Select
                            v-if="bucketOptions.length"
                            v-model="row.bucket"
                            :options="bucketOptions"
                            placeholder="Bucket"
                            class="h-7 w-32 shrink-0 text-xs"
                            aria-label="Destination bucket"
                          />
                          <Input v-else v-model="row.bucket" class="h-7 w-32 shrink-0 font-mono text-xs" placeholder="bucket" aria-label="Destination bucket" />
                          <span class="shrink-0 text-muted-foreground">/</span>
                          <Input
                            :model-value="row.path"
                            class="h-7 min-w-0 flex-1 font-mono text-xs"
                            placeholder="results/output.txt"
                            aria-label="Destination key"
                            @update:model-value="setOutputKey(row, String($event))"
                            @blur="onOutputKeyBlur(row)"
                          />
                        </div>
                      </div>
                      <div class="truncate font-mono text-[10px] text-muted-foreground" :title="outputDestination(row)">{{ outputDestination(row) }}</div>
                    </div>
                    <Button variant="ghost" size="icon-sm" class="mt-1 h-5 w-5 self-start" aria-label="Remove output" @click="removeOutput(i)"><X class="size-3" /></Button>
                  </div>
                </div>
                <p v-else class="text-[11px] text-muted-foreground">Nothing captured yet; only stdout and stderr are collected after the run.</p>
                <p v-if="!outputsValid" class="text-[11px] text-destructive">
                  Each capture needs one of your buckets, a canonical key and an absolute container path; folder captures (path ending in /) need a key ending in /; container paths and destinations must be unique.
                </p>
                <Button variant="outline" size="sm" @click="addOutput"><Plus class="size-3.5" /> Add output</Button>
              </section>
            </div>
              </div>
            </TabsContent>

            <TabsContent value="dependencies" class="mt-4 space-y-4">
              <p class="max-w-2xl rounded-md border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                Added dependencies are checked against the registry automatically (browser-only, no task is created); uv or Deno still performs the authoritative resolution when the run starts.
              </p>
              <div class="max-w-2xl space-y-2">
                <label class="text-xs font-medium text-foreground">
                  {{ runtimeId === 'python-uv' ? 'PyPI requirement' : 'npm package' }}
                </label>
                <div class="flex items-center gap-2">
                  <Input
                    v-model="dependencyDraft"
                    class="font-mono text-xs"
                    :placeholder="runtimeId === 'python-uv' ? 'requests>=2' : 'chalk@5'"
                    :invalid="dependencyError ? 'error' : undefined"
                    @keyup.enter.prevent="addDependency"
                  />
                  <Button size="sm" :disabled="!dependencyDraft.trim() || !!dependencyError" @click="addDependency">
                    <Plus class="size-3.5" /> Add
                  </Button>
                </div>
                <p v-if="dependencyError" class="text-[11px] text-destructive">{{ dependencyError }}</p>
                <p v-else class="text-[11px] text-muted-foreground">
                  <template v-if="runtimeId === 'python-uv'">
                    Requirements are stored as hidden PEP 723 metadata in the uploaded script; the editor stays unchanged.
                  </template>
                  <template v-else>
                    Packages are mapped to bare imports, for example <code class="rounded bg-muted px-1 font-mono">import chalk from "chalk"</code>.
                  </template>
                </p>
              </div>

              <ul v-if="dependencies.length" class="max-w-2xl space-y-2">
                <li
                  v-for="(dependency, index) in dependencies"
                  :key="dependency"
                  class="surface-inline flex items-center gap-2 px-3 py-2 text-xs"
                >
                  <code class="min-w-0 flex-1 truncate font-mono text-foreground">{{ dependency }}</code>
                  <Badge
                    v-if="dependencyVerification[dependency]"
                    :variant="dependencyVerification[dependency].state === 'not-found' ? 'destructive' : dependencyVerification[dependency].state === 'available' ? 'success' : 'outline'"
                    class="shrink-0 text-[10px]"
                    :title="dependencyVerification[dependency].detail"
                  >
                    {{ dependencyVerification[dependency].state }}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="`Remove ${dependency}`"
                    @click="removeDependency(index)"
                  >
                    <X class="size-3" />
                  </Button>
                </li>
              </ul>
              <p v-else class="text-xs text-muted-foreground">No extra dependencies. Standard library modules remain available.</p>
            </TabsContent>
          </Tabs>

        </div>

        <!-- Step 4: Review — mirrors the data step's in/out structure. -->
        <div v-else class="space-y-4">
          <div class="grid gap-4 text-xs lg:grid-cols-2">
            <section class="surface-muted space-y-2 p-4">
              <div class="flex items-center gap-1.5 font-semibold text-foreground">
                <ArrowDownToLine class="h-3.5 w-3.5 text-primary" /> Into the container
              </div>
              <ul class="space-y-1.5 font-mono text-[11px]">
                <li>
                  <div class="truncate text-foreground" :title="scriptUrl">{{ runtime.file }} <span class="font-sans text-muted-foreground">(uploaded on submit)</span> <Badge v-if="runtimeId === 'python-uv' && dependencies.length" variant="outline" class="ml-1 font-sans text-[9px]">{{ dependencies.length }} inline dependencies</Badge></div>
                  <div class="flex items-center gap-1 text-muted-foreground"><CornerDownRight class="h-3 w-3 shrink-0" /> {{ scriptContainerPath }}</div>
                </li>
                <li v-if="dependencyInput">
                  <div class="truncate text-foreground" :title="dependencyConfigUrl">deno.json <span class="font-sans text-muted-foreground">(generated from dependencies)</span></div>
                  <div class="flex items-center gap-1 text-muted-foreground"><CornerDownRight class="h-3 w-3 shrink-0" /> {{ dependencyConfigPath }}</div>
                </li>
                <li v-for="(input, i) in inputs" :key="i">
                  <template v-if="input.kind === 'folder'">
                    <div class="truncate text-foreground" :title="`s3://${input.bucket}/${input.prefix}`">
                      s3://{{ input.bucket }}/{{ input.prefix }} <span class="font-sans text-muted-foreground">({{ input.files.length }} file{{ input.files.length === 1 ? '' : 's' }})</span>
                    </div>
                    <div class="flex items-center gap-1 text-muted-foreground"><CornerDownRight class="h-3 w-3 shrink-0" /> {{ input.basePath }}</div>
                  </template>
                  <template v-else>
                    <div class="truncate text-foreground" :title="input.url">{{ input.url }}</div>
                    <div class="flex items-center gap-1 text-muted-foreground"><CornerDownRight class="h-3 w-3 shrink-0" /> {{ input.path }}</div>
                  </template>
                </li>
              </ul>
            </section>
            <section class="surface-muted space-y-2 p-4">
              <div class="flex items-center gap-1.5 font-semibold text-foreground">
                <ArrowUpFromLine class="h-3.5 w-3.5 text-primary" /> Out of the container
              </div>
              <ul v-if="declaredOutputs.length" class="space-y-1.5 font-mono text-[11px]">
                <li v-for="output in declaredOutputs" :key="output.path">
                  <div class="text-foreground">{{ output.path }}</div>
                  <div class="flex min-w-0 items-center gap-1 text-muted-foreground">
                    <CornerDownRight class="h-3 w-3 shrink-0" /> <span class="truncate" :title="output.url">{{ output.url }}</span>
                  </div>
                </li>
              </ul>
              <p v-else class="text-[11px] text-muted-foreground">No declared output files.</p>
              <p class="text-[11px] text-muted-foreground">stdout and stderr are always captured.</p>
            </section>
          </div>
          <p class="text-xs text-muted-foreground">
            Runs as <code class="rounded bg-muted px-1 font-mono">{{ commandPreview }}</code> in
            <code class="rounded bg-muted px-1 font-mono">{{ runtime.image }}</code>; the script is uploaded on submit (the backend does not accept inline script content).
          </p>
          <TaskJsonPreview title="TES task (POST /ga4gh/tes/v1/tasks)" :task="task" />
          <p v-if="submitError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ submitError }}</p>
        </div>
      </section>

      <div class="flex items-center justify-between">
        <Button variant="outline" size="sm" @click="back">
          <ArrowLeft v-if="step === 0" class="h-3.5 w-3.5" /> {{ step === 0 ? 'Back to Compute' : 'Back' }}
        </Button>
        <Button v-if="step < WIZARD_STEPS.length - 1" size="sm" :disabled="!canContinue" @click="next">Continue</Button>
        <Button v-else size="sm" :disabled="busy || submitting || !dataReady || !inputsValid || !outputsValid" @click="submit">
          <ListPlus class="h-4 w-4" /> {{ submitting ? 'Submitting…' : 'Submit run' }}
        </Button>
      </div>
    </div>

    <TesDataRefDialog v-model:open="inputDialogOpen" mode="input" mount-default="/work/in/" @add="addInput" />
    <CreateCredentialDialog v-model:open="credentialDialogOpen" />

    <Dialog :open="loadScriptOpen" @update:open="(v: boolean) => (loadScriptOpen = v)">
      <DialogContent class="max-w-3xl">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2"><FolderOpen class="h-4 w-4 text-primary" /> Load existing script</DialogTitle>
          <DialogDescription>
            Pick a script object to load its content into the editor. Submitting still uploads a fresh copy under the run's script location so runs stay reproducible.
          </DialogDescription>
        </DialogHeader>
        <div
          v-if="pendingScriptPick && editorHasCustomContent"
          class="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
        >
          <p>
            Replace the current editor content with
            <span class="font-mono">{{ pendingScriptPick.name }}</span>? Unsaved changes are lost.
          </p>
          <div class="flex gap-2">
            <Button size="sm" :disabled="loadScriptBusy" @click="applyScriptPick">
              {{ loadScriptBusy ? 'Loading…' : 'Replace script' }}
            </Button>
            <Button variant="outline" size="sm" :disabled="loadScriptBusy" @click="pendingScriptPick = null">Cancel</Button>
          </div>
        </div>
        <ObjectBrowserPanel v-else @select="onScriptPick" />
        <p v-if="loadScriptBusy && !(pendingScriptPick && editorHasCustomContent)" class="text-[11px] text-muted-foreground">
          Loading script…
        </p>
        <p v-if="loadScriptError" class="text-[11px] text-destructive">{{ loadScriptError }}</p>
        <DialogFooter>
          <DialogClose><Button variant="outline">Close</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
