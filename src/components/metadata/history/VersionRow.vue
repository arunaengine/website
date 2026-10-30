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
import IconTile from '@/components/ui/IconTile.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { RouterLink } from 'vue-router'
import { isArunaUserId } from '@/lib/identifiers'
import type { DatasetVersion } from '@/lib/api'
import { shortVersion } from '@/lib/versions'
import { formatDateTime, relativeTime } from '@/lib/utils'
import { FileJson, FilePen, FileText, GitBranch, GitCompare, GitMerge, MoreHorizontal, ShieldCheck, Tag, Waypoints, X } from '@lucide/vue'

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
const absolute = computed(() => formatDateTime(props.version.created_at))
</script>

<template>
  <!-- A timeline row: the kind as a tile, the time, then the message with who saved it. -->
  <li class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 px-5 py-3.5 hover:bg-muted/30 sm:grid-cols-[auto_9.5rem_minmax(0,1fr)_auto]">
    <IconTile :icon="merge ? GitMerge : version.parents.length ? FilePen : FileText" :tone="merge ? 'royal' : 'muted'" size="sm" />
    <Tooltip :label="relativeTime(version.created_at)">
      <span class="pt-1.5 text-xs tabular-nums text-muted-foreground max-sm:col-start-2 max-sm:row-start-2 max-sm:pt-0">{{ absolute }}</span>
    </Tooltip>
    <div class="min-w-0 max-sm:col-start-2 max-sm:row-start-1">
      <button
        type="button"
        class="flex min-w-0 max-w-full items-center gap-2 text-left text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="emit('open')"
      >
        <span class="truncate">{{ version.message || 'No message' }}</span>
        <Tooltip v-if="version.metadata_event_id" label="Saved as a metadata graph edit">
          <span class="shrink-0 text-muted-foreground" aria-label="Saved as a metadata graph edit"><Waypoints class="h-3.5 w-3.5" /></span>
        </Tooltip>
      </button>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <RouterLink v-if="isArunaUserId(version.author.user_id)" :to="{ name: 'user', params: { id: version.author.user_id } }" class="hover:text-foreground hover:underline">{{ author }}</RouterLink>
        <span v-else>{{ author }}</span>
        <span v-if="merge">{{ mergeTitle }}</span>
        <span class="font-mono">{{ shortVersion(version.version) }}</span>
        <Badge v-for="name in version.tags" :key="name" variant="outline" size="sm" class="font-mono">{{ name }}</Badge>
        <Tooltip v-if="version.signed" label="Carries a signature (not verified by this node)">
          <span class="inline-flex items-center gap-1" aria-label="Carries a signature (not verified by this node)"><ShieldCheck class="h-3.5 w-3.5" /> Signed</span>
        </Tooltip>
      </p>
    </div>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground max-sm:col-start-3 max-sm:row-span-2" :aria-label="`Actions for ${shortVersion(version.version)}`" :title="`Actions for ${shortVersion(version.version)}`">
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
