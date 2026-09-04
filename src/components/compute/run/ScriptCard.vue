<script setup lang="ts">
// The script the run executes: language, where it is mounted, where it is
// stored, the editor and the paths it names.
import { computed, defineAsyncComponent, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import IconButton from '@/components/ui/IconButton.vue'
import RunSection from '@/components/compute/run/RunSection.vue'
import PathChips from '@/components/compute/run/PathChips.vue'
import AiMark from '@/components/compute/run/AiMark.vue'
import DependenciesTab from '@/components/compute/run/DependenciesTab.vue'
import { injectCustomRun } from '@/composables/useCustomRun'
import { asyncChunkError } from '@/lib/chunk-recovery'
import { bucketNameProblem } from '@/lib/bucketName'
import { FolderOpen, FolderPlus, KeyRound, Plus, X } from '@lucide/vue'

// CodeMirror lands on its own async chunk, mounted only with a script.
const ScriptEditor = defineAsyncComponent({
  loader: () => import('@/components/compute/ScriptEditor.vue'),
  onError: asyncChunkError,
})

const {
  s3,
  credentialDialogOpen,
  executorMode,
  runtime,
  language,
  languageId,
  languages,
  script,
  scriptPath,
  setScriptPath,
  scriptKey,
  setScriptKey,
  scriptKeyProblem,
  stagingBucket,
  stagingBucketValid,
  bucketOptions,
  buckets,
  bucketsLoaded,
  bucketsLoading,
  createBucket,
  creatingBucket,
  createBucketError,
  stagedFileUrl,
  editorTab,
  dependencies,
  scriptPaths,
  capturePath,
  openInputDialog,
  removeScript,
  loadScriptOpen,
  reuseSelectedScript,
  scriptUrl,
  needsStagingLocation,
  hasAi,
  clearAi,
} = injectCustomRun()

const newBucket = ref('')
// The node's own bucket rule, checked before the request leaves the browser.
const newBucketProblem = computed(() => {
  const wanted = newBucket.value.trim()
  return wanted ? bucketNameProblem(wanted) : null
})

const underRuntime = computed(() => executorMode.value === 'runtime')
const languageOptions = computed(() => languages.map((entry) => ({ value: entry.id, label: entry.label })))
const unassigned = computed(() => scriptPaths.value.filter((check) => check.fix).length)
const complete = computed(() => script.value.trim().length > 0 && unassigned.value === 0)
const tabs = computed(() => [
  { value: 'script', label: language.value.file },
  ...(underRuntime.value && runtime.value.dependencies
    ? [{ value: 'dependencies', label: `Dependencies (${dependencies.value.length})` }]
    : []),
])
const checkLabel = computed(() => {
  if (!script.value.trim()) return 'The script is empty'
  if (unassigned.value) return `${unassigned.value} path${unassigned.value === 1 ? '' : 's'} not assigned`
  return 'Complete'
})
function addInputFor(path: string) {
  openInputDialog(path.slice(0, path.lastIndexOf('/') + 1))
}
</script>

<template>
  <RunSection id="section-script" title="Script" :complete="complete" :check-label="checkLabel">
    <template #state>
      <template v-if="!script.trim()">The script is empty.</template>
      <template v-else-if="unassigned">
        {{ unassigned }} path{{ unassigned === 1 ? '' : 's' }} in the script not assigned.
      </template>
      <template v-else>{{ language.file }} · saved to your bucket when you press Run.</template>
    </template>
    <template #controls>
      <Button variant="outline" size="sm" @click="loadScriptOpen = true">
        <FolderOpen class="size-3.5" /> Load existing script
      </Button>
      <IconButton
        label="Remove script"
        class="text-muted-foreground hover:text-destructive"
        @click="removeScript"
      >
        <X class="size-3.5" />
      </IconButton>
    </template>

    <Notice v-if="!s3.endpoint.value" tone="warning" class="mb-3">
      This node does not advertise an S3 endpoint, so the portal cannot store the script.
    </Notice>
    <div
      v-else-if="!s3.hasActiveKey.value"
      class="mb-3 space-y-2 rounded-md border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground"
    >
      <p class="flex items-center gap-2 font-medium text-foreground">
        <KeyRound class="size-3.5" /> S3 credentials are required to store the script.
      </p>
      <Button variant="outline" size="sm" @click="credentialDialogOpen = true">
        <Plus class="size-3.5" /> Create credentials
      </Button>
    </div>

    <div class="mb-3 grid items-start gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      <div class="min-w-0">
        <label class="flex items-center gap-1.5 text-xs font-medium text-foreground">Language</label>
        <Select
          v-if="!underRuntime"
          v-model="languageId"
          :options="languageOptions"
          class="mt-1 h-8 text-xs"
          aria-label="Language"
        />
        <Input v-else :model-value="language.label" class="mt-1 h-8 text-xs" :disabled="true" aria-label="Language" />
        <p class="mt-1 text-[11px] text-muted-foreground">
          {{ underRuntime ? 'Set by the runtime.' : 'Highlighting and file name only.' }}
        </p>
      </div>
      <div class="min-w-0">
        <label for="run-script-path" class="flex items-center gap-1.5 text-xs font-medium text-foreground">Mounted at</label>
        <Input
          id="run-script-path"
          :model-value="scriptPath"
          class="mt-1 h-8 font-mono text-xs"
          :disabled="underRuntime"
          aria-label="Mounted at"
          @update:model-value="(value) => setScriptPath(String(value))"
        />
        <p class="mt-1 text-[11px] text-muted-foreground">
          <template v-if="underRuntime">Set by the runtime.</template>
          <template v-else>Call it, for example <code class="font-mono">{{ language.call }} {{ scriptPath }}</code></template>
        </p>
      </div>
      <div class="min-w-0">
        <label class="flex items-center gap-1.5 text-xs font-medium text-foreground">Stored in bucket</label>
        <Select
          v-if="bucketOptions.length"
          id="run-script-bucket"
          v-model="stagingBucket"
          :options="bucketOptions"
          class="mt-1 h-8 text-xs"
          aria-label="Script bucket"
          :invalid="stagingBucketValid ? undefined : 'error'"
        />
        <Input
          v-else
          id="run-script-bucket"
          v-model="stagingBucket"
          class="mt-1 h-8 font-mono text-xs"
          :placeholder="bucketsLoading ? 'Loading buckets…' : 'my-results'"
          aria-label="Script bucket"
          :invalid="stagingBucketValid ? undefined : 'error'"
        />
        <p v-if="bucketsLoaded && !buckets.length" class="mt-1 text-[11px] text-destructive">
          You have no buckets yet.
        </p>
        <p v-else-if="!stagingBucketValid" class="mt-1 text-[11px] text-destructive">Pick one of your buckets.</p>
      </div>
      <div class="min-w-0">
        <label for="run-script-key" class="flex items-center gap-1.5 text-xs font-medium text-foreground">
          Key <AiMark v-if="hasAi('scriptKey')" />
        </label>
        <Input
          id="run-script-key"
          :model-value="scriptKey"
          class="mt-1 h-8 font-mono text-xs"
          aria-label="Script key"
          :invalid="scriptKeyProblem ? 'error' : undefined"
          @update:model-value="(value) => { setScriptKey(String(value)); clearAi('scriptKey') }"
        />
        <p v-if="scriptKeyProblem" class="mt-1 text-[11px] text-destructive">{{ scriptKeyProblem }}</p>
      </div>
    </div>

    <div v-if="bucketsLoaded && !buckets.length" class="mb-3 flex flex-wrap items-center gap-2">
      <Input
        v-model="newBucket"
        class="h-8 w-44 font-mono text-xs"
        placeholder="new-bucket-name"
        aria-label="New bucket name"
        :invalid="newBucketProblem ? 'error' : undefined"
        @keyup.enter="createBucket(newBucket)"
      />
      <Button
        variant="outline"
        size="sm"
        :disabled="creatingBucket || !newBucket.trim() || Boolean(newBucketProblem)"
        @click="createBucket(newBucket)"
      >
        <FolderPlus class="size-3.5" /> Create bucket
      </Button>
      <p v-if="createBucketError" class="text-[11px] text-destructive">{{ createBucketError }}</p>
      <p v-else-if="newBucketProblem" class="text-[11px] text-destructive">{{ newBucketProblem }}</p>
    </div>

    <p v-if="reuseSelectedScript && !needsStagingLocation" class="mb-2 truncate font-mono text-[11px] text-muted-foreground" :title="scriptUrl">
      Reused directly: {{ scriptUrl }}
    </p>
    <p v-else class="mb-2 truncate font-mono text-[11px] text-muted-foreground" :title="stagedFileUrl">{{ stagedFileUrl }}</p>

    <div class="overflow-hidden rounded-md border border-border">
      <div class="flex items-center gap-2 border-b border-border bg-muted px-2.5 py-1.5">
        <OptionToggle v-model="editorTab" :options="tabs" aria-label="Script editor tabs" />
        <span class="flex-1" />
        <span v-if="dependencies.length" class="text-[11px] text-muted-foreground">
          Dependencies need network access. <DocsLink topic="compute-run" label="Docs" />
        </span>
      </div>
      <div v-if="editorTab === 'script'" data-tutorial="run-script" class="min-w-0">
        <Suspense>
          <ScriptEditor v-model="script" :language="language.highlight" />
          <template #fallback>
            <div class="grid h-40 place-items-center bg-field text-xs text-muted-foreground">Loading editor…</div>
          </template>
        </Suspense>
      </div>
      <div v-if="editorTab === 'dependencies'" class="space-y-3 p-3">
        <DependenciesTab />
      </div>
    </div>
    <p v-if="!script.trim()" class="mt-1.5 text-[11px] text-destructive">The script cannot be empty.</p>

    <PathChips
      class="mt-2.5"
      label="Paths in the script:"
      :checks="scriptPaths"
      @capture="capturePath"
      @add-input="addInputFor"
    />
  </RunSection>
</template>
