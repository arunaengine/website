<script setup lang="ts">
// One short line per storage folder this bucket is linked to, pointing at its card in the group.
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { listBackendImports, type BackendImport } from '@/lib/api'
import { storeName } from '@/lib/linkedFolders'

const props = defineProps<{ bucket: string; groupId: string | null }>()

const { apiBaseUrl, authToken, sessionEpoch, listGroupBackends } = useAruna()

const lines = ref<{ link: BackendImport; place: string }[]>([])
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
        const store = backend ? storeName(backend) : 'your storage'
        return { link, place: link.backend_prefix ? `${store} / ${link.backend_prefix}` : store }
      })
  } catch {
    if (id === generation) lines.value = []
  }
}

watch(() => [props.bucket, props.groupId, sessionEpoch.value], load, { immediate: true })
</script>

<template>
  <div v-if="lines.length" class="space-y-1 lg:col-span-2" data-testid="link-note">
    <p v-for="{ link, place } in lines" :key="link.import_id" class="text-sm text-muted-foreground">
      Linked to <span class="font-mono text-foreground">{{ place }}</span> ·
      <RouterLink
        :to="{ name: 'group', params: { id: groupId! }, query: { tab: 'storage', link: link.import_id } }"
        class="font-medium text-primary hover:underline"
      >
        Manage in group storage
      </RouterLink>
    </p>
  </div>
</template>
