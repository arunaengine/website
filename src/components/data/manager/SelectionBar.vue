<script setup lang="ts">
// The actions for the ticked rows. Wide, they replace the table's header row; on a phone they are
// a bar at the bottom of the list. Below about 760 px Copy, Move and Share keep only their icons.
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import IconButton from '@/components/ui/IconButton.vue'
import type { DataManager } from '@/composables/useDataManager'
import { formatCount } from '@/lib/formatCount'
import { actionBlocker, type SelectionAction } from '@/lib/objectListing'
import { Copy, Download, FolderInput, Globe, Link2, Share2, Trash2, X } from '@lucide/vue'

const props = defineProps<{ manager: DataManager; bottom?: boolean }>()
const emit = defineEmits<{ (e: 'action', action: SelectionAction): void }>()

const {
  activeGroupId,
  selectedObjectKeys,
  selectedPrefixes,
  selectedCount,
  clearSelection,
  allListedSelected,
  someListedSelected,
  selectableListedCount,
  setAllListedSelected,
  listLoading,
} = props.manager

const blocker = (action: SelectionAction) => actionBlocker(action, selectedObjectKeys.value.size, selectedPrefixes.value.size)
const MOVES = [
  { id: 'copy', label: 'Copy to', short: 'Copy', icon: Copy },
  { id: 'move', label: 'Move to', short: 'Move', icon: FolderInput },
] as const
</script>

<template>
  <tr v-if="!bottom" class="border-b border-border bg-aruna-royal/10 text-sm normal-case tracking-normal text-foreground">
    <th class="p-0">
      <label class="flex h-11 w-11 items-center justify-center">
        <input
          type="checkbox"
          class="h-3.5 w-3.5 rounded border-border accent-primary"
          :checked="allListedSelected"
          :indeterminate="someListedSelected && !allListedSelected"
          :disabled="selectableListedCount === 0 || listLoading"
          aria-label="Select all listed folders and files"
          @change="setAllListedSelected(($event.target as HTMLInputElement).checked)"
        />
      </label>
    </th>
    <th colspan="4" class="px-3 py-1.5 text-left font-normal">
      <div class="flex min-w-0 items-center gap-1.5">
        <span class="mr-1.5 whitespace-nowrap font-medium">{{ formatCount(selectedCount) }} selected</span>
        <IconButton label="Download" variant="outline" size="icon" class="h-8 w-auto px-2.5" :disabled-reason="blocker('download')" @click="emit('action', 'download')">
          <Download class="size-3.5" /><span>Download</span>
        </IconButton>
        <IconButton v-for="move in MOVES" :key="move.id" :label="move.label" variant="outline" size="icon" class="h-8 w-auto px-2.5" @click="emit('action', move.id)">
          <component :is="move.icon" class="size-3.5" /><span class="@max-[760px]:hidden">{{ move.label }}</span>
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm" title="Share" aria-label="Share"><Share2 class="size-3.5" /><span class="@max-[760px]:hidden">Share</span></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem @click="emit('action', 'share')"><Link2 class="h-3.5 w-3.5" /> Copy links</DropdownMenuItem>
            <DropdownMenuItem v-if="activeGroupId" @click="emit('action', 'access')"><Globe class="h-3.5 w-3.5" /> Make public</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton label="Delete" variant="outline" size="icon" class="h-8 w-auto px-2.5 text-destructive hover:text-destructive" @click="emit('action', 'delete')">
          <Trash2 class="size-3.5" /><span>Delete</span>
        </IconButton>
        <button type="button" class="ml-auto shrink-0 text-primary hover:underline" @click="clearSelection">Clear</button>
      </div>
    </th>
  </tr>
  <div v-else class="sticky bottom-0 z-10 border-t border-aruna-royal/30 bg-aruna-royal/15 backdrop-blur" role="region" aria-label="Selected files">
    <div class="flex items-center justify-between px-3 pt-1.5 text-sm">
      <label class="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          class="h-4 w-4 rounded border-border accent-primary"
          :checked="allListedSelected"
          :indeterminate="someListedSelected && !allListedSelected"
          :disabled="selectableListedCount === 0 || listLoading"
          aria-label="Select all listed folders and files"
          @change="setAllListedSelected(($event.target as HTMLInputElement).checked)"
        />
        <span class="font-medium">{{ formatCount(selectedCount) }} selected</span>
      </label>
      <IconButton label="Clear selection" variant="outline" size="icon" class="h-9 w-9" @click="clearSelection"><X class="size-4" /></IconButton>
    </div>
    <div class="flex justify-around px-1 pb-2 text-[11px]">
      <button type="button" class="flex min-h-11 min-w-14 flex-col items-center gap-0.5 disabled:opacity-50" :disabled="Boolean(blocker('download'))" :title="blocker('download') ?? undefined" @click="emit('action', 'download')">
        <Download class="size-4" /> Download
      </button>
      <button v-for="move in MOVES" :key="move.id" type="button" class="flex min-h-11 min-w-14 flex-col items-center gap-0.5" @click="emit('action', move.id)">
        <component :is="move.icon" class="size-4" /> {{ move.short }}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button type="button" class="flex min-h-11 min-w-14 flex-col items-center gap-0.5"><Share2 class="size-4" /> Share</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top">
          <DropdownMenuItem @click="emit('action', 'share')"><Link2 class="h-3.5 w-3.5" /> Copy links</DropdownMenuItem>
          <DropdownMenuItem v-if="activeGroupId" @click="emit('action', 'access')"><Globe class="h-3.5 w-3.5" /> Make public</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button" class="flex min-h-11 min-w-14 flex-col items-center gap-0.5 text-destructive" @click="emit('action', 'delete')">
        <Trash2 class="size-4" /> Delete
      </button>
    </div>
  </div>
</template>
