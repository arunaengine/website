<script setup lang="ts">
// On the desktop, a linked folder that brings files down can take the run's results: they are
// written to the folder's bucket and come back to this computer with the next sync. Outputs go
// to the node that accepts the run, so only folders of that node and the run's group qualify.
import { computed, onMounted } from 'vue'
import Button from '@/components/ui/Button.vue'
import { injectCustomRun } from '@/composables/useCustomRun'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { folderName, resultFolders, type SyncedFolder } from '@/lib/deviceApi'
import { isDesktop } from '@/lib/desktop'
import { Laptop } from '@lucide/vue'

defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ choose: [bucket: string, prefix: string] }>()

const desktop = isDesktop()
const synced = useSyncedFolders()
const { groupId, runTarget } = injectCustomRun()
const { isLocalNode } = useRealmNodes()
onMounted(() => {
  if (desktop) void synced.ensureLoaded()
})

const homes = computed<SyncedFolder[]>(() =>
  desktop && !runTarget.local.value
    ? resultFolders(synced.folders.value, groupId.value, isLocalNode)
    : [],
)
</script>

<template>
  <div v-if="homes.length" class="flex flex-wrap items-center gap-2 text-xs">
    <Laptop class="h-3.5 w-3.5 text-muted-foreground" />
    <span class="text-muted-foreground">Comes back to this computer:</span>
    <Button
      v-for="folder in homes"
      :key="folder.folder_id"
      size="sm"
      variant="outline"
      :disabled="disabled"
      :title="`${folder.remote.bucket}/${folder.remote.prefix}`"
      @click="emit('choose', folder.remote.bucket, folder.remote.prefix)"
    >
      {{ folderName(folder.root) }}
    </Button>
  </div>
