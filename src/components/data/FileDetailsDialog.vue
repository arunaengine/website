<script setup lang="ts">
// One surface for a file: the details, the version history, and the rules and
// copies of the chosen version, plus a preview mode that fills the same frame.
// A folder shows the same general details; it has no versions, copies or preview.
// The open tab lives in the route (`?object=&tab=`), so a details view is a
// link a person can share or reload; `tab=preview` is that mode.
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import ObjectLocationsPanel from '@/components/data/ObjectLocationsPanel.vue'
import ReferencedBy from '@/components/data/ReferencedBy.vue'
import ObjectVersionsPanel from '@/components/data/ObjectVersionsPanel.vue'
import PublicAccessDialog from '@/components/data/PublicAccessDialog.vue'
import ObjectRulesEditor from '@/components/storage/ObjectRulesEditor.vue'
import PolicyColumn from '@/components/storage/PolicyColumn.vue'
import PreviewBody from '@/components/preview/PreviewBody.vue'
import { endpointForNode, nodeApiBase } from '@/composables/s3/endpoints'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useBacklinks } from '@/composables/useBacklinks'
import type { SyncRow } from '@/composables/useBucketSyncs'
import { usePublicAccess, type PublicAccess } from '@/composables/usePublicAccess'
import { useS3, s3ErrorMessage } from '@/composables/useS3'
import { useAssistantObject } from '@/composables/useAssistantObject'
import { exactFileBacklinkPreflight } from '@/lib/backlinks'
import { publicUrl, type PublicTarget } from '@/lib/publicAccess'
import { arnLocationLabel, parseArunaArn } from '@/lib/sync'
import type { DeleteRequest } from '@/lib/deletion/request'
import { featureEnabled } from '@/lib/config'
import { isNotebookKey } from '@/lib/notebook/document'
import { stateVariant } from '@/lib/stateBadge'
import { formatBytes, relativeTime, truncateMiddle } from '@/lib/utils'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowLeftRight, Eye, Globe, ListTree, Lock, NotebookPen } from '@lucide/vue'

const props = defineProps<{
  open: boolean
  tab: string
  bucket: string
  objectKey: string
  name: string
  size?: number
  lastModified?: Date
  nodeId?: string | null
  groupId: string | null
  referencedFrom?: {
    label: string
    connectorId?: string | null
    groupId?: string | null
    originNodeId?: string | null
  } | null
  probeReference?: boolean
  /** Bumped by the view after a deletion so the panels reload. */
  revision?: number
  /** Set where the dialog is not the data browser, so leaving is a choice. */
  browseHref?: string
  /** Set when it opens from the assistant, which floats above the modal layer. */
  raised?: boolean
  /** The exact version to show first, as a run's captured output names one. */
  versionId?: string | null
  /** The key is a folder prefix; only the general details apply. */
  folder?: boolean
  /** The view's shared public access state, so its list badges follow a change here. */
  access?: PublicAccess
  /** The sync relationships that cover this key. */
  syncs?: SyncRow[]
}>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'update:tab', value: string): void
  (e: 'delete', request: DeleteRequest): void
  (e: 'changed'): void
}>()

const s3 = useS3()
const { currentUser, apiBaseUrl } = useAruna()
const { displayName: nodeName } = useRealmNodes()
const { leave } = useAssistantObject()
const head = ref<{ contentType?: string; versionId?: string } | null>(null)
const headError = ref<string | null>(null)
const headBusy = ref(false)
// A version chosen in the Versions tab; the Preview and Storage tabs follow it.
const pinnedVersion = ref<string | null>(null)
let headSeq = 0

const remote = computed(() => Boolean(props.nodeId))
const currentVersion = computed(() => pinnedVersion.value ?? head.value?.versionId ?? null)
// Preview is a mode of this dialog, not a tab: it fills the frame under the
// same header, and the tabs are one click away.
const previewMode = computed(() => props.tab === 'preview' && !props.folder)
const detailsTab = computed(() => (previewMode.value ? 'general' : props.tab))
const notebookLink = computed(() => !remote.value && !pinnedVersion.value && props.groupId &&
  isNotebookKey(props.objectKey) && featureEnabled('tes')
  ? { name: 'notebook', params: { bucketId: props.bucket, key: props.objectKey }, query: { group: props.groupId } }
  : null)

async function loadHead() {
  if (!props.objectKey || remote.value || props.folder) return
  const seq = ++headSeq
  headBusy.value = true
  headError.value = null
  try {
    const response = await s3.headObject(props.bucket, props.objectKey, props.nodeId ?? null)
    if (seq !== headSeq) return
    head.value = { contentType: response.contentType, versionId: response.versionId }
  } catch (err) {
    if (seq !== headSeq) return
    head.value = null
    headError.value = s3ErrorMessage(err)
  } finally {
    if (seq === headSeq) headBusy.value = false
  }
}

// Everyone's read access to this key, through the group's "public" role.
const access = props.access ?? usePublicAccess(computed(() => props.groupId))
const fileTarget = computed<PublicTarget>(() => ({
  kind: props.folder ? 'folder' : 'file',
  bucket: props.bucket,
  key: props.objectKey,
}))
const filePublic = computed(() => access.isPublic(props.nodeId ?? null, fileTarget.value))
const publicOpen = ref(false)
const fileUrl = computed(() => {
  const endpoint = filePublic.value ? endpointForNode(props.nodeId ?? null) : null
  return endpoint ? publicUrl(endpoint, fileTarget.value) : null
})

const syncRows = computed(() =>
  (props.syncs ?? []).map(({ relationship, direction }) => {
    const other = direction === 'outgoing' ? relationship.target : relationship.source
    return {
      key: `${relationship.id}:${direction}`,
      direction: direction === 'outgoing' ? 'To' : 'From',
      node: nodeName(parseArunaArn(other)?.nodeId),
      location: arnLocationLabel(other),
      state: relationship.state,
    }
  }),
)
const syncsLink = computed(() => ({
  name: 'bucket-storage',
  params: { bucketId: props.bucket },
  query: {
    tab: 'syncs',
    ...(props.nodeId ? { node: props.nodeId } : {}),
    ...(props.groupId ? { group: props.groupId } : {}),
  },
}))

// The datasets that reference this key, asked of the node that holds the bucket.
const {
  result: referenceResult,
  error: referencesError,
  busy: referencesBusy,
  load: loadReferenceLookup,
  reset: resetReferences,
} = useBacklinks()
const fileReferences = computed(() =>
  referenceResult.value
    ? exactFileBacklinkPreflight(referenceResult.value, props.bucket, props.objectKey)
    : null,
)

function loadReferences() {
  const apiBase = props.nodeId ? nodeApiBase(props.nodeId) : apiBaseUrl.value
  if (!currentUser.value || !apiBase || props.folder) {
    resetReferences()
    return
  }
  void loadReferenceLookup(
    { target: { kind: 'bucket_prefix', bucket: props.bucket, prefix: props.objectKey } },
    apiBase,
  )
}

watch(
  () => [props.open, props.bucket, props.objectKey, props.revision, props.versionId],
  () => {
    pinnedVersion.value = props.versionId ?? null
    if (props.open) {
      void loadHead()
      loadReferences()
    } else {
      head.value = null
      resetReferences()
    }
  },
  { immediate: true },
)

// A deep link opens the dialog before the browser holds an S3 session, so the
// first head lookup fails; the session's arrival repeats it.
watch(
  () => s3.hasActiveKey.value,
  (ready) => {
    if (ready && props.open && !head.value) void loadHead()
  },
)

function previewVersion(versionId: string) {
  pinnedVersion.value = versionId
  emit('update:tab', 'preview')
}

// Leaving for the data browser closes this view and takes the chat along
// where a surface asks for it.
function openBrowser() {
  leave()
  emit('update:open', false)
}

const details = computed(() => props.folder ? [
  { label: 'Bucket', value: props.bucket },
  { label: 'Folder', value: props.objectKey },
  { label: 'Node', value: nodeName(props.nodeId) },
] : [
  { label: 'Key', value: props.objectKey },
  { label: 'Size', value: props.size === undefined ? 'unknown' : formatBytes(props.size) },
  {
    label: 'Last modified',
    value: props.lastModified ? relativeTime(props.lastModified.toISOString()) : 'unknown',
  },
  { label: 'Content type', value: head.value?.contentType || 'unknown' },
])
</script>

<template>
  <DetailDialog
    :open="props.open"
    :content-class="props.raised ? 'z-[var(--z-assistant-modal)]' : undefined"
    @update:open="(value: boolean) => emit('update:open', value)"
  >
    <template #header>
      <div class="flex min-w-0 items-start justify-between gap-3">
        <div class="min-w-0">
          <DialogTitle class="truncate text-base font-semibold text-foreground" :title="props.name">
            {{ props.name || props.objectKey || 'File' }}
          </DialogTitle>
          <p class="mt-0.5 font-mono text-[11px] text-muted-foreground">
            <span class="break-all">{{ props.bucket }}/{{ props.objectKey }}</span>
            <span v-if="props.size !== undefined"> · {{ formatBytes(props.size) }}</span>
          </p>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <RouterLink
            v-if="props.browseHref"
            :to="props.browseHref"
            class="text-xs font-medium text-primary hover:underline"
            @click="openBrowser"
          >Open in the data browser</RouterLink>
          <Button v-if="notebookLink && !previewMode" variant="outline" size="sm" as-child>
            <RouterLink :to="notebookLink" @click="leave"><NotebookPen class="h-4 w-4" /> Open notebook</RouterLink>
          </Button>
          <Button
            v-if="!props.folder"
            variant="outline"
            size="sm"
            @click="emit('update:tab', previewMode ? 'general' : 'preview')"
          >
            <component :is="previewMode ? ListTree : Eye" class="h-4 w-4" />
            {{ previewMode ? 'Details' : 'Preview' }}
          </Button>
        </div>
      </div>
    </template>

    <div v-if="previewMode" class="flex h-full min-h-[60dvh] flex-col gap-3">
      <p v-if="pinnedVersion" class="text-xs text-muted-foreground">
        Showing version <span class="hash">{{ truncateMiddle(pinnedVersion, 8, 6) }}</span>.
        <button type="button" class="underline" @click="pinnedVersion = null">Show the current version</button>
      </p>
      <PreviewBody
        class="flex-1"
        :active="props.open"
        :bucket="props.bucket"
        :object-key="props.objectKey"
        :name="props.name"
        :size="props.size"
        :content-type="head?.contentType"
        :node-id="props.nodeId"
        :version-id="pinnedVersion"
        :referenced-from="props.referencedFrom"
        :probe-reference="props.probeReference"
      >
        <template #actions>
          <Button v-if="notebookLink" variant="outline" size="sm" as-child>
            <RouterLink :to="notebookLink" @click="leave"><NotebookPen class="h-4 w-4" /> Open notebook</RouterLink>
          </Button>
        </template>
      </PreviewBody>
    </div>

    <Tabs
      v-else
      :model-value="detailsTab"
      @update:model-value="(value: string) => emit('update:tab', value)"
    >
      <TabsList v-if="!props.folder" aria-label="File sections">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="versions">Versions</TabsTrigger>
        <TabsTrigger value="storage">Storage</TabsTrigger>
      </TabsList>

      <TabsContent value="general" class="surface p-4">
        <dl class="space-y-2 text-xs">
          <div v-for="detail in details" :key="detail.label" class="flex items-baseline justify-between gap-4">
            <dt class="shrink-0 text-muted-foreground">{{ detail.label }}</dt>
            <dd class="min-w-0 break-all text-right font-mono text-foreground">{{ detail.value }}</dd>
          </div>
          <div v-if="!props.folder" class="flex items-baseline justify-between gap-4">
            <dt class="shrink-0 text-muted-foreground">Current version</dt>
            <dd class="flex min-w-0 items-center justify-end gap-1">
              <Spinner v-if="headBusy" label="Loading the file details" />
              <template v-else-if="currentVersion">
                <span class="hash" :title="currentVersion">{{ truncateMiddle(currentVersion, 8, 6) }}</span>
                <CopyButton :value="currentVersion" label="Copy version id" />
                <Badge v-if="pinnedVersion" :variant="stateVariant('older')" size="sm">Pinned</Badge>
              </template>
              <span v-else class="text-muted-foreground">unknown</span>
            </dd>
          </div>
          <div v-if="props.groupId" class="flex items-center justify-between gap-4">
            <dt class="shrink-0 text-muted-foreground">Public access</dt>
            <dd class="flex min-w-0 items-center justify-end gap-2">
              <Badge :variant="filePublic ? 'success' : 'secondary'" size="sm" class="uppercase">
                <Globe v-if="filePublic" class="mr-0.5 size-3" aria-hidden="true" />
                <Lock v-else class="mr-0.5 size-3" aria-hidden="true" />
                {{ filePublic ? 'public' : 'private' }}
              </Badge>
              <Button variant="outline" size="sm" @click="publicOpen = true">
                <Globe class="h-3.5 w-3.5" /> Access…
              </Button>
            </dd>
          </div>
          <div v-if="fileUrl" class="flex min-w-0 items-center justify-end gap-1">
            <a :href="fileUrl" target="_blank" rel="noopener noreferrer" class="min-w-0 truncate font-mono text-[11px] text-primary hover:underline" :title="fileUrl">{{ fileUrl }}</a>
            <CopyButton :value="fileUrl" label="Copy the public link" />
          </div>
        </dl>
        <div v-if="syncRows.length" class="mt-4 border-t border-border pt-3 text-xs">
          <div class="flex items-center gap-2">
            <ArrowLeftRight class="h-4 w-4 text-primary" aria-hidden="true" />
            <span class="font-medium text-foreground">Sync</span>
            <RouterLink :to="syncsLink" class="ml-auto text-primary hover:underline">Manage syncs</RouterLink>
          </div>
          <ul class="mt-2 divide-y divide-border/60 rounded-md border border-border/60">
            <li v-for="row in syncRows" :key="row.key" class="flex min-w-0 items-center gap-2 px-3 py-2">
              <span class="shrink-0 text-muted-foreground">{{ row.direction }}</span>
              <span class="min-w-0 truncate font-mono" :title="row.location">{{ row.location }}</span>
              <span class="shrink-0 text-muted-foreground">on {{ row.node }}</span>
              <Badge :variant="stateVariant(row.state)" size="sm" class="ml-auto shrink-0">{{ row.state }}</Badge>
            </li>
          </ul>
        </div>
        <p v-if="props.referencedFrom" class="mt-3 text-xs text-muted-foreground">
          Referenced from {{ props.referencedFrom.label }}.
        </p>
        <p v-if="headError" class="mt-3 text-xs text-muted-foreground">{{ headError }}</p>
        <p v-if="props.folder" class="mt-3 text-xs text-muted-foreground">
          A public folder rule covers every file below it, including files added later.
        </p>
        <ReferencedBy
          v-if="currentUser && !props.folder"
          class="mt-4 border-t border-border pt-3"
          :preflight="fileReferences"
          :busy="referencesBusy"
          :error="referencesError"
          @retry="loadReferences"
        />
      </TabsContent>

      <TabsContent value="versions" class="surface p-4">
        <ObjectVersionsPanel
          :active="props.open && props.tab === 'versions'"
          :bucket="props.bucket"
          :object-key="props.objectKey"
          :node-id="props.nodeId"
          :revision="props.revision"
          @delete="(request: DeleteRequest) => emit('delete', request)"
          @preview="previewVersion"
          @changed="emit('changed')"
        />
      </TabsContent>

      <TabsContent value="storage">
        <div class="grid gap-4 lg:grid-cols-2">
          <div class="surface space-y-3 p-4">
            <PolicyColumn
              :key="props.revision"
              :bucket="props.bucket"
              :object-key="props.objectKey"
              :node-id="props.nodeId ?? null"
            />
            <ObjectRulesEditor
              :bucket="props.bucket"
              :object-key="props.objectKey"
              :version-id="currentVersion"
              :group-id="props.groupId"
              :node-id="props.nodeId"
              @saved="emit('changed')"
            />
          </div>
          <ObjectLocationsPanel
            :key="props.revision"
            class="surface p-4"
            :active="props.open && props.tab === 'storage'"
            :bucket="props.bucket"
            :object-key="props.objectKey"
            :version-id="pinnedVersion"
            :node-id="props.nodeId"
            :group-id="props.groupId"
          />
        </div>
      </TabsContent>
    </Tabs>
  </DetailDialog>
  <PublicAccessDialog
    v-if="props.groupId"
    v-model:open="publicOpen"
    :access="access"
    :node-id="props.nodeId ?? null"
    :targets="[fileTarget]"
    :raised="props.raised"
  />
</template>
