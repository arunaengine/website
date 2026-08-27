<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import { useJobs } from '@/composables/useJobs'
import { useRefresh } from '@/composables/useRefresh'
import { formatBytes, truncateMiddle } from '@/lib/utils'
import type { JobArtifactStatus } from '@/lib/jobs'
import { Download } from '@lucide/vue'

// The run crate archive sits behind bearer auth, so it cannot be a plain link:
// HEAD reports whether it is there and GET hands back a Blob the browser saves
// through a short-lived object URL.
const props = defineProps<{ jobId: string }>()

const { headJobArtifact, downloadJobArtifact } = useJobs()

const status = ref<JobArtifactStatus | null>(null)
const checking = ref(false)
const downloading = ref(false)
const downloadError = ref<string | null>(null)
let requestId = 0
let objectUrl: string | null = null

function releaseUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
}
onUnmounted(releaseUrl)

async function check() {
  const id = ++requestId
  checking.value = true
  downloadError.value = null
  try {
    const result = await headJobArtifact(props.jobId)
    if (id !== requestId) return
    status.value = result
  } catch (err) {
    if (id !== requestId) return
    status.value = { state: 'error', message: err instanceof Error ? err.message : String(err) }
  } finally {
    if (id === requestId) checking.value = false
  }
}

const { busy: checkBusy, refresh: onCheck } = useRefresh(check)
const spinning = computed(() => checkBusy.value || checking.value)

async function download() {
  if (downloading.value) return
  downloading.value = true
  downloadError.value = null
  try {
    const { blob, ...rest } = await downloadJobArtifact(props.jobId)
    const result = { ...rest, blob }
    status.value = rest
    if (!result.blob) {
      downloadError.value = result.message ?? 'The run crate could not be downloaded.'
      return
    }
    releaseUrl()
    objectUrl = URL.createObjectURL(result.blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = result.filename || `${props.jobId}-run-crate.zip`
    anchor.click()
  } catch (err) {
    downloadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    downloading.value = false
  }
}

watch(() => props.jobId, () => {
  releaseUrl()
  status.value = null
  void check()
}, { immediate: true })
</script>

<template>
  <section class="space-y-2">
    <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Run crate archive</h3>

    <p v-if="checking && !status" class="text-xs text-muted-foreground">Checking for an archive…</p>

    <template v-else-if="status">
      <div v-if="status.state === 'available'" class="space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" :disabled="downloading" @click="download">
            <Download class="h-3.5 w-3.5" /> {{ downloading ? 'Downloading…' : 'Download run crate' }}
          </Button>
          <span v-if="status.size !== undefined" class="text-[11px] text-muted-foreground">
            {{ formatBytes(status.size) }}
          </span>
          <Badge v-if="status.etag" variant="outline" class="font-mono text-[10px]" :title="`ETag ${status.etag}`">
            {{ truncateMiddle(status.etag) }}
          </Badge>
        </div>
        <p class="text-[11px] text-muted-foreground">
          The ETag is the archive's BLAKE3 hash: the same value identifies the same bytes.
        </p>
      </div>

      <div v-else-if="status.state === 'pending'" class="flex flex-wrap items-center gap-2">
        <p class="text-xs text-muted-foreground">
          The archive is written once the job finishes<template v-if="status.jobState">, and the job
          is {{ status.jobState }}</template>.
        </p>
        <RefreshButton :busy="spinning" label="Check again" @click="onCheck" />
      </div>

      <p v-else-if="status.state === 'expired'" class="text-xs text-muted-foreground">
        The archive's retention window has passed, so it is gone. The job's records remain.
      </p>

      <p v-else-if="status.state === 'unauthorized'" class="text-xs text-muted-foreground">
        This token may not read the run crate of this job.
      </p>

      <p v-else-if="status.state === 'absent'" class="text-xs text-muted-foreground">
        No run crate archive is kept for this job.
      </p>

      <div v-else class="flex flex-wrap items-center gap-2">
        <p class="text-xs text-muted-foreground">{{ status.message || 'The archive could not be checked.' }}</p>
        <RefreshButton :busy="spinning" label="Retry" @click="onCheck" />
      </div>
    </template>

    <p v-if="downloadError" class="text-[11px] text-destructive">{{ downloadError }}</p>
  </section>
</template>
