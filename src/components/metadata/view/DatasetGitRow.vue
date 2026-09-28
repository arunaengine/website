<script setup lang="ts">
// The clone address of a dataset's Git repository. Nothing shows until the node
// answers; a node without Git or a reader without access shows no row.
import { ref, watch } from 'vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import { useAruna } from '@/composables/useAruna'
import { getGitRepository } from '@/lib/api'

const props = defineProps<{ documentId: string }>()
const { apiBaseUrl, authToken, sessionEpoch } = useAruna()

const cloneUrl = ref<string | null>(null)
let generation = 0

watch(
  [() => props.documentId, sessionEpoch],
  async () => {
    const current = ++generation
    cloneUrl.value = null
    try {
      const repository = await getGitRepository(props.documentId, { baseUrl: apiBaseUrl.value, token: authToken.value })
      if (current === generation) cloneUrl.value = repository.clone_url || null
    } catch {
      // Missing, refused or unavailable: the row stays hidden.
    }
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="cloneUrl" class="space-y-2 border-t border-border px-5 py-4">
    <h3 class="text-sm font-medium text-foreground">Git repository</h3>
    <p class="text-xs text-muted-foreground">
      Clone, pull and push this dataset as an ARC with Git. Sign in with your Aruna token.
      <DocsLink topic="dataset-git" label="How to use Git with a dataset" />
    </p>
    <div class="flex items-center gap-2">
      <code class="min-w-0 flex-1 break-all rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs text-foreground">{{ cloneUrl }}</code>
      <CopyButton :value="cloneUrl" label="Copy the clone URL" />
    </div>
  </div>
</template>
