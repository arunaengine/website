<script setup lang="ts">
// On the desktop, a linked folder that brings files down can take the run's results: they are
// written to the folder's bucket and come back to this computer with the next sync.
import { computed, onMounted } from 'vue'
import Button from '@/components/ui/Button.vue'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { folderName, type SyncedFolder } from '@/lib/deviceApi'
import { isDesktop } from '@/lib/desktop'
import { Laptop } from '@lucide/vue'

defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ choose: [bucket: string, prefix: string] }>()

const desktop = isDesktop()
const synced = useSyncedFolders()
onMounted(() => {
  if (desktop) void synced.ensureLoaded()
})

const homes = computed<SyncedFolder[]>(() =>
  desktop ? synced.folders.value.filter((folder) => folder.mode !== 'upload_only' && folder.state === 'active') : [],
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
