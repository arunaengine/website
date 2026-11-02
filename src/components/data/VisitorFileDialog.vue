<script setup lang="ts">
// A public file's details for a visitor: what the listing knows, its bucket's nodes, and its download.
import { computed } from 'vue'
import RowList from '@/components/distributed/RowList.vue'
import Button from '@/components/ui/Button.vue'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import type { PublicFile } from '@/composables/usePublicData'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { formatBytes, formatDate } from '@/lib/utils'
import { Download } from '@lucide/vue'

const props = defineProps<{ file: PublicFile | null; bucket: string; download: string | null; nodes: string[] }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const realmNodes = useRealmNodes()

const rows = computed(() => {
  const file = props.file
  if (!file) return []
  return [
    { label: 'Size', value: file.size !== null ? formatBytes(file.size) : '-' },
    { label: 'Modified', value: file.lastModified ? formatDate(file.lastModified) : '-' },
    ...(file.contentType ? [{ label: 'Type', value: file.contentType }] : []),
    { label: 'Bucket nodes', value: props.nodes.map((id) => realmNodes.displayName(id)).join(', ') || '-' },
    { label: 'Version', value: file.versionId, mono: true },
  ]
})
</script>

<template>
  <DetailDialog :open="Boolean(file)" fit @update:open="(open: boolean) => !open && emit('close')">
    <template #header>
      <DialogTitle class="truncate text-base font-semibold text-foreground" :title="file?.name">{{ file?.name }}</DialogTitle>
      <p class="mt-0.5 font-mono text-[11px] text-muted-foreground"><span class="break-all">{{ bucket }}/{{ file?.key }}</span></p>
    </template>
    <template v-if="download" #actions>
      <Button size="sm" as-child>
        <a :href="download" download><Download class="h-4 w-4" /> Download</a>
      </Button>
    </template>
    <div class="overflow-y-auto px-6 py-5">
      <RowList :rows="rows" />
    </div>
  </DetailDialog>
</template>
