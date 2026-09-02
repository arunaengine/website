<script setup lang="ts">
// Which version a whole-file permanent delete acts on. It is the Versions tab
// listing reduced to a choice, and it defaults to the current version.
import Badge from '@/components/ui/Badge.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { s3ErrorMessage, useS3 } from '@/composables/useS3'
import { versionStateLabel, type ObjectVersionEntry } from '@/lib/objectVersions'
import { stateVariant } from '@/lib/stateBadge'
import { formatBytes, relativeTime, truncateMiddle } from '@/lib/utils'
import { ref, watch } from 'vue'

const props = defineProps<{
  bucket: string
  objectKey: string
  nodeId: string | null
  selected: string | null
  disabled?: boolean
}>()
const emit = defineEmits<{ (e: 'select', entry: ObjectVersionEntry | null): void }>()

const s3 = useS3()
const versions = ref<ObjectVersionEntry[]>([])
const truncated = ref(false)
const loading = ref(false)
const loadError = ref<string | null>(null)
let loadSeq = 0

async function load() {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = null
  try {
    const page = await s3.listObjectVersions(props.bucket, props.objectKey, props.nodeId)
    if (seq !== loadSeq) return
    versions.value = page.versions
    truncated.value = page.truncated
    emit('select', page.versions.find((entry) => entry.isLatest) ?? page.versions[0] ?? null)
  } catch (caught) {
    if (seq !== loadSeq) return
    versions.value = []
    loadError.value = s3ErrorMessage(caught)
    emit('select', null)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(
  () => [props.bucket, props.objectKey, props.nodeId],
  () => void load(),
  { immediate: true },
)
</script>

<template>
  <div class="space-y-2 rounded-md border border-border px-3 py-2">
    <p class="font-medium text-foreground">Which version</p>
    <Spinner v-if="loading" show-label label="Loading versions…" class="py-2" />
    <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
    <p v-else-if="!versions.length" class="text-muted-foreground">
      This node holds no version of this file.
    </p>
    <fieldset v-else class="space-y-1" :disabled="props.disabled">
      <label
        v-for="entry in versions"
        :key="entry.versionId"
        class="flex cursor-pointer flex-wrap items-center gap-2 rounded-md border border-border px-2 py-1.5"
      >
        <input
          type="radio"
          class="accent-primary"
          name="deletion-version"
          :value="entry.versionId"
          :checked="props.selected === entry.versionId"
          @change="emit('select', entry)"
        />
        <Badge :variant="stateVariant(versionStateLabel(entry))" size="sm">
          {{ versionStateLabel(entry) }}
        </Badge>
        <span class="hash" :title="entry.versionId">{{ truncateMiddle(entry.versionId, 8, 6) }}</span>
        <span class="text-muted-foreground">
          {{ entry.lastModified ? relativeTime(entry.lastModified.toISOString()) : 'unknown date' }}
        </span>
        <span class="font-mono text-muted-foreground">
          {{ entry.deleteMarker || entry.size === undefined ? '-' : formatBytes(entry.size) }}
        </span>
      </label>
    </fieldset>
    <p v-if="truncated" class="text-muted-foreground">
      Only the newest versions of this file are listed.
    </p>
  </div>
</template>
