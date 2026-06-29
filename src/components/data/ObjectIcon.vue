<script setup lang="ts">
import {
  Folder,
  FileText,
  FileJson,
  FileSpreadsheet,
  FileArchive,
  FileImage,
  FileAudio,
  FileVideo,
  FileCode2,
  Table,
  Binary,
  File,
} from '@lucide/vue'
import { computed } from 'vue'

const props = defineProps<{ name: string; folder?: boolean; class?: string }>()

const pick = computed(() => {
  if (props.folder) return { icon: Folder, color: 'text-aruna-royal' }
  const ext = props.name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'tiff', 'bmp'].includes(ext))
    return { icon: FileImage, color: 'text-rose-500' }
  if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext))
    return { icon: FileVideo, color: 'text-purple-500' }
  if (['mp3', 'wav', 'flac', 'ogg'].includes(ext))
    return { icon: FileAudio, color: 'text-emerald-500' }
  if (ext === 'pdf') return { icon: FileText, color: 'text-rose-600' }
  if (['json', 'jsonld'].includes(ext)) return { icon: FileJson, color: 'text-amber-600' }
  if (ext === 'parquet') return { icon: Table, color: 'text-aruna-sky' }
  if (['csv', 'tsv', 'xlsx'].includes(ext))
    return { icon: FileSpreadsheet, color: 'text-emerald-600' }
  if (['py', 'r', 'js', 'ts', 'sh', 'rs', 'ipynb', 'fasta', 'fa'].includes(ext))
    return { icon: FileCode2, color: 'text-indigo-500' }
  if (['nc', 'h5', 'hdf5', 'bin'].includes(ext)) return { icon: Binary, color: 'text-aruna-indigo' }
  if (['zip', 'tar', 'gz', 'zst', 'xz', '7z'].includes(ext))
    return { icon: FileArchive, color: 'text-muted-foreground' }
  if (['txt', 'md', 'log'].includes(ext)) return { icon: FileText, color: 'text-muted-foreground' }
  return { icon: File, color: 'text-muted-foreground' }
})
</script>

<template>
  <component :is="pick.icon" :class="[pick.color, $props.class]" />
</template>
