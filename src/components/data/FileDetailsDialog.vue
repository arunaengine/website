<script setup lang="ts">
// One surface for a file: the details, the version history, and the rules and
// copies of the chosen version, plus a preview mode that fills the same frame.
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
import ObjectVersionsPanel from '@/components/data/ObjectVersionsPanel.vue'
import ObjectRulesEditor from '@/components/storage/ObjectRulesEditor.vue'
import PolicyColumn from '@/components/storage/PolicyColumn.vue'
import PreviewBody from '@/components/preview/PreviewBody.vue'
import { useS3, s3ErrorMessage } from '@/composables/useS3'
import { useAssistantObject } from '@/composables/useAssistantObject'
import type { DeleteRequest } from '@/lib/deletion/request'
import { stateVariant } from '@/lib/stateBadge'
import { formatBytes, relativeTime, truncateMiddle } from '@/lib/utils'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Eye, ListTree } from '@lucide/vue'

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
}>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'update:tab', value: string): void
  (e: 'delete', request: DeleteRequest): void
  (e: 'changed'): void
}>()

const s3 = useS3()
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
const previewMode = computed(() => props.tab === 'preview')
const detailsTab = computed(() => (previewMode.value ? 'general' : props.tab))

async function loadHead() {
  if (!props.objectKey || remote.value) return
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

watch(
  () => [props.open, props.bucket, props.objectKey, props.revision],
  () => {
    pinnedVersion.value = null
    if (props.open) void loadHead()
    else head.value = null
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

const details = computed(() => [
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
        <div class="flex shrink-0 items-center gap-2">
          <RouterLink
            v-if="props.browseHref"
            :to="props.browseHref"
            class="text-xs font-medium text-primary hover:underline"
            @click="openBrowser"
          >Open in the data browser</RouterLink>
          <Button
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
      />
    </div>

    <Tabs
      v-else
      :model-value="detailsTab"
      @update:model-value="(value: string) => emit('update:tab', value)"
    >
      <TabsList aria-label="File sections">
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
          <div class="flex items-baseline justify-between gap-4">
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
        </dl>
        <p v-if="props.referencedFrom" class="mt-3 text-xs text-muted-foreground">
          Referenced from {{ props.referencedFrom.label }}.
        </p>
        <p v-if="headError" class="mt-3 text-xs text-muted-foreground">{{ headError }}</p>
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
</template>
