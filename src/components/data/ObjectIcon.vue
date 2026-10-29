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
  Binary,
  Dna,
  File,
} from '@lucide/vue'
import { computed, type Component } from 'vue'

// A neutral icon by the file's kind; only folders take the site's blue. The kind is the tooltip.
const props = defineProps<{ name: string; folder?: boolean; class?: string }>()

const KINDS: [string[], Component, string][] = [
  [['fa', 'fasta', 'fna'], Dna, 'genome sequence'],
  [['faa'], Dna, 'protein sequences'],
  [['ffn', 'frn'], Dna, 'gene sequences'],
  [['fq', 'fastq'], Dna, 'sequencing reads'],
  [['sam', 'bam', 'cram', 'paf'], Dna, 'alignment'],
  [['embl', 'gb', 'gbk', 'gbff'], FileText, 'EMBL or GenBank annotation'],
  [['gff', 'gff3', 'gtf', 'bed'], FileText, 'GFF3 annotation'],
  [['csv', 'tsv', 'xlsx', 'parquet', 'vcf'], FileSpreadsheet, 'table'],
  [['json', 'jsonld'], FileJson, 'JSON'],
  [['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'tiff', 'bmp'], FileImage, 'image'],
  [['mp4', 'mkv', 'webm', 'mov', 'avi'], FileVideo, 'video'],
  [['mp3', 'wav', 'flac', 'ogg'], FileAudio, 'audio'],
  [['py', 'r', 'js', 'ts', 'sh', 'rs', 'ipynb'], FileCode2, 'code'],
  [['nc', 'h5', 'hdf5', 'bin'], Binary, 'binary data'],
  [['zip', 'tar', 'gz', 'zst', 'xz', '7z', 'bz2'], FileArchive, 'archive'],
  [['pdf', 'txt', 'md', 'log'], FileText, 'text'],
]
const COMPRESSED = ['gz', 'zst', 'xz', 'bz2']
const kindOf = (ext: string) => KINDS.find(([exts]) => exts.includes(ext))

const pick = computed<{ icon: Component; kind: string; color: string }>(() => {
  if (props.folder) return { icon: Folder, kind: 'folder', color: 'text-primary' }
  const parts = props.name.toLowerCase().split('.').slice(1)
  const ext = parts.at(-1) ?? ''
  // A compressed sequence or table keeps the icon of what it holds.
  const inner = COMPRESSED.includes(ext) && parts.length > 1 ? kindOf(parts.at(-2)!) : undefined
  if (inner && inner[1] !== FileArchive) return { icon: inner[1], kind: `compressed ${inner[2]}`, color: 'text-muted-foreground' }
  const found = kindOf(ext)
  return { icon: found?.[1] ?? File, kind: found?.[2] ?? 'file', color: 'text-muted-foreground' }
})
</script>

<template>
  <span class="inline-flex shrink-0" :title="pick.kind">
    <component :is="pick.icon" :class="[pick.color, $props.class]" aria-hidden="true" />
  </span>
</template>
