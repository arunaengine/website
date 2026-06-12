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
  Link2,
  Binary,
  File,
} from 'lucide-vue-next'
import { computed } from 'vue'
import type { S3Object } from '@/data/types'

const props = defineProps<{ object: S3Object; class?: string }>()

const pick = computed(() => {
  if (props.object.kind === 'folder') return { icon: Folder, color: 'text-aruna-royal' }
  if (props.object.kind === 'reference') return { icon: Link2, color: 'text-aruna-aqua' }
  const mime = props.object.mime
  if (mime.startsWith('image/')) return { icon: FileImage, color: 'text-rose-500' }
  if (mime.startsWith('video/')) return { icon: FileVideo, color: 'text-purple-500' }
  if (mime.startsWith('audio/')) return { icon: FileAudio, color: 'text-emerald-500' }
  if (mime === 'application/pdf') return { icon: FileText, color: 'text-rose-600' }
  if (mime === 'application/json' || mime === 'application/ld+json') return { icon: FileJson, color: 'text-amber-600' }
  if (mime === 'application/vnd.apache.parquet') return { icon: Table, color: 'text-aruna-sky' }
  if (mime === 'text/csv') return { icon: FileSpreadsheet, color: 'text-emerald-600' }
  if (mime === 'text/fasta') return { icon: FileCode2, color: 'text-indigo-500' }
  if (mime === 'application/x-netcdf') return { icon: Binary, color: 'text-aruna-indigo' }
  if (mime === 'application/octet-stream') return { icon: FileArchive, color: 'text-muted-foreground' }
  return { icon: File, color: 'text-muted-foreground' }
})
</script>

<template>
  <component :is="pick.icon" :class="[pick.color, $props.class]" />
</template>
