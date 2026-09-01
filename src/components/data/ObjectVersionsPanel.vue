<script setup lang="ts">
// Every version and delete marker of one file, newest first. Versioning is
// always on, so this is the only place where a single version can be restored,
// promoted or removed; the object row itself only ever writes a delete marker.
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Notice from '@/components/ui/Notice.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useS3, s3ErrorMessage } from '@/composables/useS3'
import { deletionOptions } from '@/lib/deletion/options'
import type { DeleteRequest } from '@/lib/deletion/request'
import type { ObjectVersionEntry } from '@/lib/objectVersions'
import { stateVariant } from '@/lib/stateBadge'
import { formatBytes, relativeTime, truncateMiddle } from '@/lib/utils'
import { computed, ref, watch } from 'vue'
import { Download, Eye, Trash2, Undo2 } from '@lucide/vue'

const props = defineProps<{
  active: boolean
  bucket: string
  objectKey: string
  nodeId?: string | null
  /** Bumped by the parent after a deletion so the list reloads. */
  revision?: number
}>()
const emit = defineEmits<{
  (e: 'delete', request: DeleteRequest): void
  (e: 'preview', versionId: string): void
  (e: 'changed'): void
}>()

const s3 = useS3()
const versions = ref<ObjectVersionEntry[]>([])
const truncated = ref(false)
const loading = ref(false)
const loadError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const restoringId = ref<string | null>(null)
let loadSeq = 0

const remote = computed(() => Boolean(props.nodeId))
const canWrite = computed(() => s3.canWrite(props.bucket, props.objectKey, props.nodeId ?? null))
const headIsMarker = computed(() => versions.value.find((entry) => entry.isLatest)?.deleteMarker ?? false)

async function load() {
  if (!props.objectKey || remote.value) return
  const seq = ++loadSeq
  loading.value = true
  loadError.value = null
  try {
    const page = await s3.listObjectVersions(props.bucket, props.objectKey, props.nodeId ?? null)
    if (seq !== loadSeq) return
    versions.value = page.versions
    truncated.value = page.truncated
  } catch (err) {
    if (seq !== loadSeq) return
    versions.value = []
    loadError.value = s3ErrorMessage(err)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(
  () => [props.active, props.bucket, props.objectKey, props.nodeId, props.revision],
  () => {
    if (props.active) void load()
  },
  { immediate: true },
)

function badgeLabel(entry: ObjectVersionEntry): string {
  if (entry.deleteMarker) return 'Delete marker'
  return entry.isLatest ? 'Current' : 'Older'
}

function target(entry: ObjectVersionEntry): DeleteRequest {
  return {
    kind: entry.deleteMarker ? 'marker' : 'version',
    bucket: props.bucket,
    nodeId: props.nodeId ?? null,
    key: props.objectKey,
    versionId: entry.versionId,
    isCurrent: entry.isLatest,
    headState: headIsMarker.value ? 'marker' : 'live',
    bytes: entry.size,
  }
}

function rowOptions(entry: ObjectVersionEntry) {
  return deletionOptions({
    kind: entry.deleteMarker ? 'marker' : 'version',
    isCurrent: entry.isLatest,
    bytes: entry.size,
    permissions: { canWrite: canWrite.value, canPurge: null },
    remote: remote.value,
  })
}

function option(entry: ObjectVersionEntry, id: string) {
  return rowOptions(entry).find((candidate) => candidate.id === id) ?? null
}

async function download(entry: ObjectVersionEntry) {
  actionError.value = null
  try {
    const url = await s3.downloadUrl(props.bucket, props.objectKey, props.nodeId ?? null, entry.versionId)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = props.objectKey.split('/').pop() ?? props.objectKey
    anchor.rel = 'noopener'
    anchor.click()
  } catch (err) {
    actionError.value = s3ErrorMessage(err)
  }
}

// Restoring is one call: deleting the delete marker moves the head back to the
// newest stored version, so it needs no confirmation.
async function restore(entry: ObjectVersionEntry) {
  if (!canWrite.value) return
  restoringId.value = entry.versionId
  actionError.value = null
  try {
    await s3.deleteObjectVersion(props.bucket, props.objectKey, entry.versionId, props.nodeId ?? null)
    await load()
    emit('changed')
  } catch (err) {
    actionError.value = s3ErrorMessage(err)
  } finally {
    restoringId.value = null
  }
}
</script>

<template>
  <div class="space-y-3">
    <RefusalNote
      v-if="remote"
      tone="warning"
      message="This bucket is served by another node.
Its S3 endpoint does not allow cross-origin browsing from this portal, so its versions cannot be listed here."
    />

    <template v-else>
      <p class="text-xs text-muted-foreground">
        Every write keeps the previous version. A delete marker is the version a plain Delete writes:
        removing it makes the file current again.
      </p>

      <Spinner v-if="loading && !versions.length" show-label label="Loading versions…" class="py-6" />
      <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
      <EmptyState v-else-if="!versions.length" compact title="This node holds no version of this file." />

      <ul v-else class="space-y-1">
        <li
          v-for="entry in versions"
          :key="entry.versionId"
          class="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-xs"
        >
          <Badge :variant="stateVariant(badgeLabel(entry))" size="sm">{{ badgeLabel(entry) }}</Badge>
          <span class="hash" :title="entry.versionId">{{ truncateMiddle(entry.versionId, 8, 6) }}</span>
          <CopyButton :value="entry.versionId" label="Copy version id" />
          <span class="text-muted-foreground">
            {{ entry.lastModified ? relativeTime(entry.lastModified.toISOString()) : 'unknown date' }}
          </span>
          <span class="font-mono text-muted-foreground">
            {{ entry.deleteMarker || entry.size === undefined ? '-' : formatBytes(entry.size) }}
          </span>
          <span class="flex flex-1 items-center justify-end gap-1">
            <template v-if="!entry.deleteMarker">
              <IconButton label="Preview this version" @click="emit('preview', entry.versionId)">
                <Eye class="size-3.5" />
              </IconButton>
              <IconButton label="Download this version" @click="download(entry)">
                <Download class="size-3.5" />
              </IconButton>
            </template>
            <Spinner v-if="restoringId === entry.versionId" label="Restoring the object" />
            <Button
              v-if="option(entry, 'restore')"
              variant="outline"
              size="sm"
              :disabled="Boolean(option(entry, 'restore')?.disabledReason) || restoringId !== null"
              :title="option(entry, 'restore')?.disabledReason ?? option(entry, 'restore')?.description"
              @click="restore(entry)"
            >
              <Undo2 class="size-3.5" /> Restore
            </Button>
            <Button
              v-if="option(entry, 'make-current')"
              variant="outline"
              size="sm"
              :disabled="Boolean(option(entry, 'make-current')?.disabledReason)"
              :title="option(entry, 'make-current')?.description"
              @click="emit('delete', target(entry))"
            >
              Make current
            </Button>
            <IconButton
              v-if="option(entry, 'delete-version')"
              label="Delete this version…"
              class="text-destructive hover:text-destructive"
              :disabled-reason="option(entry, 'delete-version')?.disabledReason ?? null"
              @click="emit('delete', target(entry))"
            >
              <Trash2 class="size-3.5" />
            </IconButton>
          </span>
        </li>
      </ul>

      <p v-if="truncated" class="text-xs text-muted-foreground">
        Only the newest versions of this file are listed.
      </p>
      <Notice v-if="actionError" tone="error">{{ actionError }}</Notice>
      <p v-if="!canWrite" class="text-xs text-muted-foreground">
        This session is read-only for this file, so its versions cannot be changed.
      </p>
    </template>
  </div>
</template>
