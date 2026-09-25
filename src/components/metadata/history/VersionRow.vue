<script setup lang="ts">
// One version in the list. The row opens what changed in it; the menu holds
// the rarer actions. Write actions only show for writers.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import type { DatasetVersion } from '@/lib/api'
import { shortVersion } from '@/lib/versions'
import { relativeTime } from '@/lib/utils'
import { FileJson, GitBranch, GitCompare, GitMerge, MoreHorizontal, ShieldCheck, Tag, Waypoints, X } from '@lucide/vue'

const props = defineProps<{ version: DatasetVersion; author: string; canWrite: boolean }>()
const emit = defineEmits<{
  (e: 'open'): void
  (e: 'compare'): void
  (e: 'crate'): void
  (e: 'tag'): void
  (e: 'branch'): void
  (e: 'untag', name: string): void
}>()

const merge = computed(() => props.version.parents.length > 1)
const mergeTitle = computed(() => `Merge of ${props.version.parents.map(shortVersion).join(' and ')}`)
const absolute = computed(() => new Date(props.version.created_at).toLocaleString())
</script>

<template>
  <li class="flex items-center gap-4 px-5 hover:bg-muted/30">
    <span
      class="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-primary/70"
      :class="merge ? 'bg-primary/70' : 'bg-background'"
      aria-hidden="true"
    />
    <button
      type="button"
      class="flex min-w-0 flex-1 items-center gap-2 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      @click="emit('open')"
    >
      <span class="truncate text-sm font-medium text-foreground">{{ version.message || 'No message' }}</span>
      <Tooltip v-if="merge" :label="mergeTitle">
        <span class="shrink-0 text-muted-foreground" :aria-label="mergeTitle"><GitMerge class="h-3.5 w-3.5" /></span>
      </Tooltip>
      <Tooltip v-if="version.metadata_event_id" label="Saved as a metadata graph edit">
        <span class="shrink-0 text-muted-foreground" aria-label="Saved as a metadata graph edit"><Waypoints class="h-3.5 w-3.5" /></span>
      </Tooltip>
      <Badge v-for="name in version.tags" :key="name" variant="outline" size="sm" class="shrink-0 font-mono">{{ name }}</Badge>
    </button>
    <span class="hidden shrink-0 text-xs text-muted-foreground sm:block">{{ author }}</span>
    <Tooltip :label="absolute">
      <span class="w-24 shrink-0 text-right text-xs text-muted-foreground">{{ relativeTime(version.created_at) }}</span>
    </Tooltip>
    <span class="hidden w-20 shrink-0 font-mono text-xs text-muted-foreground sm:block">{{ shortVersion(version.version) }}</span>
    <span class="w-4 shrink-0 text-muted-foreground">
      <Tooltip v-if="version.signed" label="Carries a signature (not verified by this node)">
        <span aria-label="Carries a signature (not verified by this node)"><ShieldCheck class="h-3.5 w-3.5" /></span>
      </Tooltip>
    </span>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" aria-label="More actions" title="More actions">
          <MoreHorizontal class="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem class="cursor-pointer" @select="emit('compare')"><GitCompare class="h-4 w-4" /> Compare with main</DropdownMenuItem>
        <DropdownMenuItem class="cursor-pointer" @select="emit('crate')"><FileJson class="h-4 w-4" /> View RO-Crate</DropdownMenuItem>
        <template v-if="canWrite">
          <DropdownMenuSeparator />
          <DropdownMenuItem class="cursor-pointer" @select="emit('tag')"><Tag class="h-4 w-4" /> Create tag</DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @select="emit('branch')"><GitBranch class="h-4 w-4" /> Create branch here</DropdownMenuItem>
          <DropdownMenuItem
            v-for="name in version.tags"
            :key="name"
            class="cursor-pointer text-destructive focus:text-destructive"
            @select="emit('untag', name)"
          >
            <X class="h-4 w-4" /> Remove tag {{ name }}
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>
  </li>
</template>
