<script lang="ts">
// Tab switches remount the row; one answer per dataset and session serves a minute.
import type { StorageLocation } from '@/lib/api'
type Answer = { url: string | null; layout: string | null; storage: StorageLocation | null; error: string | null }
const answers = new Map<string, Answer & { at: number }>()
const ANSWER_TTL_MS = 60_000
</script>

<script setup lang="ts">
// The clone address of a dataset's Git repository. Nothing shows until the node
// answers; a node without Git or a reader without access shows no row.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import { getGitRepository } from '@/lib/api'
import { folderRoute } from '@/lib/crate/dataIdentity'

// `changed` is a location saved on this page after the answer was cached.
const props = defineProps<{ documentId: string; groupId?: string; changed?: StorageLocation | null }>()
const { apiBaseUrl, authToken, sessionEpoch } = useAruna()

const cloneUrl = ref<string | null>(null)
const layout = ref<string | null>(null)
const storage = ref<StorageLocation | null>(null)
const failure = ref<string | null>(null)
const pending = ref(false)
const shownStorage = computed(() => props.changed ?? storage.value)
let generation = 0
// A pending snapshot is asked about again, with growing pauses, until it is finished.
let retry: ReturnType<typeof setTimeout> | undefined
const RETRY_MS = [2_000, 4_000, 8_000, 15_000]

onBeforeUnmount(() => {
  generation++
  clearTimeout(retry)
})

async function load(current: number, key: string, attempt: number) {
  try {
    const repository = await getGitRepository(props.documentId, { baseUrl: apiBaseUrl.value, token: authToken.value })
    if (current !== generation) return
    cloneUrl.value = repository.clone_url || null
    layout.value = repository.layout === 'arc' ? 'ARC' : repository.layout === 'rocrate' ? 'RO-Crate' : null
    storage.value = repository.storage_location ?? null
    failure.value = repository.error || null
    pending.value = repository.pending === true
    // A pending answer is not kept, so the next visit shows the finished state.
    if (!pending.value) {
      answers.set(key, { at: Date.now(), url: cloneUrl.value, layout: layout.value, storage: storage.value, error: failure.value })
      return
    }
    const pause = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]
    retry = setTimeout(() => {
      if (current === generation) void load(current, key, attempt + 1)
    }, pause)
  } catch {
    // Missing, refused or unavailable: the row stays hidden.
  }
}

watch(
  [() => props.documentId, sessionEpoch],
  async () => {
    const current = ++generation
    clearTimeout(retry)
    const key = `${sessionEpoch.value}:${apiBaseUrl.value}:${props.documentId}`
    const kept = answers.get(key)
    if (kept && Date.now() - kept.at < ANSWER_TTL_MS) {
      cloneUrl.value = kept.url
      layout.value = kept.layout
      storage.value = kept.storage
      failure.value = kept.error
      pending.value = false
      return
    }
    cloneUrl.value = null
    layout.value = null
    storage.value = null
    failure.value = null
    pending.value = false
    await load(current, key, 0)
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="cloneUrl" class="space-y-2 border-t border-border px-5 py-4">
    <h3 class="flex items-center gap-2 text-sm font-medium text-foreground">
      Git repository <Badge v-if="layout" size="sm" variant="outline">{{ layout }}</Badge>
      <Spinner v-if="pending" label="Updating snapshot" show-label class="font-normal" />
    </h3>
    <p class="text-xs text-muted-foreground">
      Clone, pull and push this dataset with Git, as an ARC or as a plain RO-Crate with your own files. Sign in with your Aruna token.
      <DocsLink topic="dataset-git" label="How to use Git with a dataset" />
    </p>
    <p v-if="shownStorage" class="break-all text-xs text-muted-foreground">
      Files you push are stored in
      <RouterLink :to="folderRoute(shownStorage.bucket, shownStorage.prefix, groupId)" class="font-mono text-primary hover:underline">{{ shownStorage.bucket }}/{{ shownStorage.prefix }}</RouterLink>.
    </p>
    <div class="flex items-center gap-2">
      <code class="min-w-0 flex-1 break-all rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs text-foreground">{{ cloneUrl }}</code>
      <CopyButton :value="cloneUrl" label="Copy the clone URL" />
    </div>
    <Notice title="Data files use Git LFS">
      After cloning, <code class="font-mono">git add</code> stores data files in Git LFS automatically, so
      <code class="font-mono">git-lfs</code> must be installed. One push can add at most 4 MiB of new Git objects.
    </Notice>
    <Notice v-if="failure" tone="warning" title="The last change could not be turned into a new version">
      <p class="break-words">{{ failure }}</p>
    </Notice>
  </div>
</template>
