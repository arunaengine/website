<script setup lang="ts">
import { ChevronRight, FileText, Folder } from '@lucide/vue'
import type { MetaPathFolder } from './permission-paths'

defineProps<{
  node: MetaPathFolder
  expanded: Set<string>
  selected?: string[]
}>()

defineEmits<{
  (e: 'toggle', path: string): void
  (e: 'select', suffix: string): void
}>()
</script>

<template>
  <ul class="space-y-0.5">
    <li v-for="folder in node.folders" :key="folder.path">
      <div class="group flex items-center gap-1">
        <button
          type="button"
          class="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-xs text-foreground hover:bg-muted"
          :aria-expanded="expanded.has(folder.path)"
          @click="$emit('toggle', folder.path)"
        >
          <ChevronRight :class="['h-3 w-3 shrink-0 transition-transform', expanded.has(folder.path) && 'rotate-90']" />
          <Folder class="h-3.5 w-3.5 shrink-0 text-primary/70" />
          <span class="truncate font-mono">{{ folder.name }}/</span>
        </button>
        <button
          type="button"
          :class="[
            'rounded px-1.5 py-0.5 text-[10px] transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100',
            selected?.includes(`meta/${folder.path}/**`) ? 'text-primary opacity-100' : 'text-muted-foreground opacity-0',
          ]"
          :title="`Select this folder — includes everything inside (meta/${folder.path}/**)`"
          @click="$emit('select', `meta/${folder.path}/**`)"
        >
          select folder
        </button>
      </div>
      <div v-if="expanded.has(folder.path)" class="ml-3.5 border-l border-border/60 pl-2">
        <MetaPathTree
          :node="folder"
          :expanded="expanded"
          :selected="selected"
          @toggle="$emit('toggle', $event)"
          @select="$emit('select', $event)"
        />
      </div>
    </li>
    <li v-for="doc in node.documents" :key="doc.path">
      <button
        type="button"
        :class="[
          'flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-muted hover:text-foreground',
          selected?.includes(`meta/${doc.path}`) ? 'text-primary' : 'text-muted-foreground',
        ]"
        :title="`Select only this document (meta/${doc.path})`"
        @click="$emit('select', `meta/${doc.path}`)"
      >
        <span class="w-3 shrink-0" />
        <FileText class="h-3.5 w-3.5 shrink-0" />
        <span class="truncate font-mono">{{ doc.name }}</span>
      </button>
    </li>
  </ul>
</template>
