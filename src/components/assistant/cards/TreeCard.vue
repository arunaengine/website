<script setup lang="ts">
// A listing the assistant asked to show, nested from the flat paths it passed.
// Every file links into the data browser once a bucket is known.
import { computed } from 'vue'
import BucketLink from '@/components/assistant/BucketLink.vue'
import ObjectLink from '@/components/assistant/ObjectLink.vue'
import type { TreeView } from '@/lib/assistant/types'
import { formatBytes } from '@/lib/utils'
import { File, Folder, FolderTree } from '@lucide/vue'

const props = defineProps<{ view: TreeView }>()

interface Row {
  path: string
  name: string
  depth: number
  folder: boolean
  size?: number
}

// The separator sorts ahead of every other character, so a child never lands
// beside a sibling of its parent.
function sortKey(path: string): string {
  return path.replace(/\//g, '\u0000')
}

const rows = computed<Row[]>(() => {
  const seen = new Map<string, Row>()
  for (const entry of props.view.entries) {
    const parts = entry.path.split('/')
    parts.forEach((name, depth) => {
      const path = parts.slice(0, depth + 1).join('/')
      if (depth < parts.length - 1) {
        if (!seen.has(path)) seen.set(path, { path, name, depth, folder: true })
        return
      }
      seen.set(path, { path, name, depth, folder: entry.kind === 'folder', size: entry.size })
    })
  }
  return [...seen.values()].sort((a, b) => {
    const left = sortKey(a.path)
    const right = sortKey(b.path)
    return left < right ? -1 : left > right ? 1 : 0
  })
})

const files = computed(() => rows.value.filter((row) => !row.folder).length)
</script>

<template>
  <div class="surface-inline overflow-hidden text-xs">
    <div class="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
      <FolderTree class="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ view.title }}</span>
      <BucketLink
        v-if="view.bucket"
        :bucket="view.bucket"
        class="shrink-0 truncate text-[11px] text-primary hover:underline"
        :title="`Open the bucket ${view.bucket}`"
      >{{ view.bucket }}</BucketLink>
      <span class="shrink-0 text-[11px] text-muted-foreground">{{ files }} {{ files === 1 ? 'file' : 'files' }}</span>
    </div>
    <ul class="scrollbar-thin max-h-72 overflow-auto py-1.5">
      <li
        v-for="row in rows"
        :key="row.path"
        class="flex items-baseline gap-1.5 px-2.5 py-0.5"
        :style="{ paddingLeft: `${0.625 + row.depth * 0.75}rem` }"
      >
        <Folder v-if="row.folder" class="h-3 w-3 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
        <File v-else class="h-3 w-3 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
        <ObjectLink
          v-if="!row.folder && view.bucket"
          :bucket="view.bucket"
          :object-key="row.path"
          :name="row.name"
          :size="row.size"
          class="min-w-0 flex-1 truncate text-primary hover:underline"
          :title="`${view.bucket}/${row.path}`"
        >{{ row.name }}</ObjectLink>
        <span v-else class="min-w-0 flex-1 truncate text-foreground/85" :title="row.path">{{ row.name }}</span>
        <span v-if="row.size !== undefined" class="shrink-0 font-mono text-[10px] text-muted-foreground">
          {{ formatBytes(row.size) }}
        </span>
      </li>
      <li v-if="view.dropped" class="px-2.5 py-0.5 text-muted-foreground">
        and {{ view.dropped }} more not shown
      </li>
    </ul>
  </div>
</template>
