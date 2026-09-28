<script lang="ts">
// Tab switches remount the row; one answer per dataset and session serves a minute.
import type { StorageLocation } from '@/lib/api'
const answers = new Map<string, { at: number; url: string | null; layout: string | null; storage: StorageLocation | null }>()
const ANSWER_TTL_MS = 60_000
</script>

<script setup lang="ts">
// The clone address of a dataset's Git repository. Nothing shows until the node
// answers; a node without Git or a reader without access shows no row.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import { useAruna } from '@/composables/useAruna'
import { getGitRepository } from '@/lib/api'
import { folderRoute } from '@/lib/crate/dataIdentity'

// `changed` is a location saved on this page after the answer was cached.
const props = defineProps<{ documentId: string; groupId?: string; changed?: StorageLocation | null }>()
const { apiBaseUrl, authToken, sessionEpoch } = useAruna()

const cloneUrl = ref<string | null>(null)
const layout = ref<string | null>(null)
const storage = ref<StorageLocation | null>(null)
const shownStorage = computed(() => props.changed ?? storage.value)
let generation = 0

watch(
  [() => props.documentId, sessionEpoch],
  async () => {
    const current = ++generation
    const key = `${sessionEpoch.value}:${apiBaseUrl.value}:${props.documentId}`
    const kept = answers.get(key)
    if (kept && Date.now() - kept.at < ANSWER_TTL_MS) {
      cloneUrl.value = kept.url
      layout.value = kept.layout
      storage.value = kept.storage
      return
    }
    cloneUrl.value = null
    layout.value = null
    storage.value = null
    try {
      const repository = await getGitRepository(props.documentId, { baseUrl: apiBaseUrl.value, token: authToken.value })
      if (current !== generation) return
      cloneUrl.value = repository.clone_url || null
      layout.value = repository.layout === 'arc' ? 'ARC' : repository.layout === 'rocrate' ? 'RO-Crate' : null
      storage.value = repository.storage_location ?? null
      answers.set(key, { at: Date.now(), url: cloneUrl.value, layout: layout.value, storage: storage.value })
    } catch {
      // Missing, refused or unavailable: the row stays hidden.
    }
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="cloneUrl" class="space-y-2 border-t border-border px-5 py-4">
    <h3 class="flex items-center gap-2 text-sm font-medium text-foreground">
      Git repository <Badge v-if="layout" size="sm" variant="outline">{{ layout }}</Badge>
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
  </div>
</template>
