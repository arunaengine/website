<script setup lang="ts">
// Script editor and the data it works on; mounts sit next to the editor so
// container paths are visible while the script is written.
import { defineAsyncComponent } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import ContainerDataPanel from '@/components/compute/quick/ContainerDataPanel.vue'
import DependenciesTab from '@/components/compute/quick/DependenciesTab.vue'
import { injectQuickRun } from '@/composables/useQuickRun'
import { asyncChunkError } from '@/lib/chunk-recovery'
import { FolderOpen, KeyRound, Plus } from '@lucide/vue'

// CodeMirror lands on its own async chunk, mounted only at the script step.
const ScriptEditor = defineAsyncComponent({
  loader: () => import('@/components/compute/ScriptEditor.vue'),
  onError: asyncChunkError,
})

const {
  s3,
  credentialDialogOpen,
  groupId,
  groupOptions,
  reuseSelectedScript,
  scriptUrl,
  needsStagingLocation,
  bucketOptions,
  buckets,
  bucketsLoaded,
  bucketsLoading,
  stagingBucket,
  stagingBucketValid,
  scriptKey,
  scriptKeyValid,
  defaultScriptKey,
  setScriptKey,
  stagedFileUrl,
  editorTab,
  runtimeId,
  dependencies,
  script,
  runtime,
  commandPreview,
  loadScriptOpen,
} = injectQuickRun()
</script>

<template>
  <div class="space-y-5">
    <!-- Credentials gate -->
    <Notice v-if="!s3.endpoint.value" tone="warning">
      This node does not advertise an S3 endpoint, so the portal cannot stage the script. Use Custom run to reference an existing script.
    </Notice>
    <div v-else-if="!s3.hasActiveKey.value" class="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
      <p class="flex items-center gap-2 font-medium text-foreground"><KeyRound class="h-3.5 w-3.5" /> S3 credentials are required to stage the script and browse data.</p>
      <Button variant="outline" size="sm" @click="credentialDialogOpen = true"><Plus class="size-3.5" /> Create credentials</Button>
    </div>

    <div v-if="s3.endpoint.value && s3.hasActiveKey.value" class="grid gap-3 sm:grid-cols-2">
      <div>
        <label class="text-xs font-medium text-foreground">Group</label>
        <GroupSelect v-model="groupId" :options="groupOptions" placeholder="Select a group" class="mt-1" />
        <p class="mt-1 text-[11px] text-muted-foreground">Owns the run and receives its run dataset.</p>
      </div>
      <div>
        <div v-if="reuseSelectedScript">
          <label class="text-xs font-medium text-foreground">Existing script</label>
          <p class="mt-1 truncate font-mono text-[11px] text-foreground" :title="scriptUrl">{{ scriptUrl }}</p>
          <p class="mt-1 text-[11px] text-muted-foreground">Reused directly; no script object will be uploaded.</p>
        </div>
        <div v-if="needsStagingLocation" :class="reuseSelectedScript ? 'mt-3' : ''">
          <label class="text-xs font-medium text-foreground">{{ reuseSelectedScript ? 'Generated files location' : 'Script location' }} <span class="text-destructive">*</span></label>
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
              :aria-label="reuseSelectedScript ? 'Generated file path basis' : 'Script object key'"
              :invalid="!scriptKeyValid ? 'error' : undefined"
              @update:model-value="setScriptKey(String($event))"
            />
          </div>
          <p v-if="stagingBucket.trim() && !stagingBucketValid" class="mt-1 text-[11px] text-destructive">
            This bucket does not exist. Files can only be staged into one of your buckets.
          </p>
          <p v-else-if="bucketsLoaded && !buckets.length" class="mt-1 text-[11px] text-destructive">
            You have no buckets yet. Create one in Data first.
          </p>
          <p v-else-if="!scriptKeyValid" class="mt-1 text-[11px] text-destructive">
            Use an object key without a leading slash or empty segments, ending in a file name.
          </p>
          <p v-else class="mt-1 truncate font-mono text-[11px] text-muted-foreground" :title="stagedFileUrl">{{ stagedFileUrl }}</p>
          <p class="mt-1 text-[11px] text-muted-foreground">
            {{ reuseSelectedScript ? 'Generated dependency files are uploaded here.' : "The default key keeps each run's copy separate, so a repeat never overwrites a script an earlier run references." }}
          </p>
        </div>
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

          <ContainerDataPanel />
        </div>
      </TabsContent>

      <TabsContent value="dependencies" class="mt-4 space-y-4">
        <DependenciesTab />
      </TabsContent>
    </Tabs>
  </div>
</template>
