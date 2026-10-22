<script setup lang="ts">
// Where the files of a linked bucket are, with Change opening its Edit in the group Storage tab.
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import { useAruna } from '@/composables/useAruna'
import { listBackendImports, type BackendImport } from '@/lib/api'
import { shownPattern } from '@/lib/bucketNaming'
import { splitPath } from '@/lib/storageRules'

const props = defineProps<{ bucket: string; groupId: string | null }>()

const { apiBaseUrl, authToken, sessionEpoch, listGroupBackends } = useAruna()

const lines = ref<{ link: BackendImport; storage: string; place: string }[]>([])
let generation = 0

// Only group admins can read the links; for everyone else, or on an older node, the line stays away.
async function load() {
  const id = ++generation
  lines.value = []
  const groupId = props.groupId
  if (!groupId) return
  try {
    const [links, listed] = await Promise.all([
      listBackendImports(groupId, { baseUrl: apiBaseUrl.value, token: authToken.value }),
      listGroupBackends(groupId),
    ])
    if (id !== generation) return
    lines.value = links
      .filter((link) => link.bucket === props.bucket)
      .map((link) => {
        const backend = listed.backends.find((entry) => entry.backend_id === link.backend_id)
        if (!backend) return { link, storage: 'Your storage', place: link.backend_prefix }
        const { bucket, folder } = splitPath(backend, link.backend_prefix)
        const path = folder.replace(/\/+$/, '')
        return { link, storage: backend.name, place: path ? `${bucket}/${path}` : bucket }
      })
  } catch {
    if (id === generation) lines.value = []
  }
}

watch(() => [props.bucket, props.groupId, sessionEpoch.value], load, { immediate: true })
</script>

<template>
  <section v-for="{ link, storage, place } in lines" :key="link.import_id" class="surface flex items-center gap-3 px-5 py-4 lg:col-span-2" data-testid="link-note">
    <div class="min-w-0 flex-1">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Where the files are</h2>
      <p class="mt-1 text-xs text-muted-foreground">
        {{ storage }} / <span class="font-mono text-foreground">{{ place }}</span>. New uploads are named
        <span class="font-mono text-foreground">{{ shownPattern(link.write_pattern) }}</span>.
      </p>
    </div>
    <Button as-child variant="outline" size="sm">
      <RouterLink :to="{ name: 'group', params: { id: groupId! }, query: { tab: 'storage', link: link.import_id } }">
        Change
      </RouterLink>
    </Button>
  </section>
</template>
