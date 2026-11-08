<script setup lang="ts">
// The actions for the ticked rows. Wide, they replace the table's header row; on a phone they are
// one row of icons above the bottom navigation. Below about 600 px the header keeps only icons.
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import IconButton from '@/components/ui/IconButton.vue'
import type { DataManager } from '@/composables/useDataManager'
import { formatCount } from '@/lib/formatCount'
import { downloadKind, type SelectionAction } from '@/lib/objectListing'
import { Copy, Download, FileArchive, FolderInput, Globe, Trash2, X } from '@lucide/vue'
import { computed } from 'vue'

// `span`: the table columns after the checkbox, which the actions cover. `locked`: no ZIP, as the
// bucket is locked on its node or that is not known yet. `started`: a ZIP download just began.
const props = withDefaults(defineProps<{ manager: DataManager; bottom?: boolean; span?: number; locked?: boolean; started?: boolean }>(), { span: 4 })
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

const download = computed(() => downloadKind(selectedObjectKeys.value.size, selectedPrefixes.value.size, props.locked))
const MOVES = [
  { id: 'copy', label: 'Copy to', icon: Copy },
  { id: 'move', label: 'Move to', icon: FolderInput },
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
    <th :colspan="span" class="px-3 py-1.5 text-left font-normal">
      <div class="flex min-w-0 items-center gap-1.5">
        <span class="mr-1.5 whitespace-nowrap font-medium">{{ formatCount(selectedCount) }} selected</span>
        <IconButton v-if="download === 'download'" label="Download" variant="outline" size="icon" class="h-8 w-auto px-2.5" @click="emit('action', 'download')">
          <Download class="size-3.5" /><span class="@max-[600px]:hidden">Download</span>
        </IconButton>
        <IconButton v-else-if="download === 'zip'" label="Download as ZIP" variant="outline" size="icon" class="h-8 w-auto px-2.5" @click="emit('action', 'zip')">
          <FileArchive class="size-3.5" /><span class="@max-[600px]:hidden">Download as ZIP</span>
        </IconButton>
        <span v-if="started" role="status" class="ml-1.5 whitespace-nowrap text-xs text-muted-foreground">See your browser's downloads</span>
        <IconButton v-for="move in MOVES" :key="move.id" :label="move.label" variant="outline" size="icon" class="h-8 w-auto px-2.5" @click="emit('action', move.id)">
          <component :is="move.icon" class="size-3.5" /><span class="@max-[600px]:hidden">{{ move.label }}</span>
        </IconButton>
        <IconButton v-if="activeGroupId" label="Make public" variant="outline" size="icon" class="h-8 w-auto px-2.5" @click="emit('action', 'access')">
          <Globe class="size-3.5" /><span class="@max-[600px]:hidden">Make public</span>
        </IconButton>
        <IconButton label="Delete" variant="outline" size="icon" class="h-8 w-auto px-2.5 text-destructive hover:text-destructive" @click="emit('action', 'delete')">
          <Trash2 class="size-3.5" /><span class="@max-[600px]:hidden">Delete</span>
        </IconButton>
        <Button variant="ghost" size="sm" class="ml-auto shrink-0 px-2.5" @click="clearSelection"><X class="size-3.5" /> Clear</Button>
      </div>
    </th>
  </tr>
  <!-- Fixed above the phone's bottom navigation, whose height it adds to the safe area. -->
  <div
    v-else
    class="sticky bottom-0 z-30 flex items-center gap-1 border-t border-border bg-popover px-3 py-2 text-sm shadow-lg max-md:fixed max-md:inset-x-0 max-md:bottom-[calc(3.5625rem+max(env(safe-area-inset-bottom),0.5rem))]"
    role="region"
    aria-label="Selected files"
  >
    <span class="mr-auto whitespace-nowrap font-medium">{{ formatCount(selectedCount) }} selected</span>
    <IconButton v-if="download === 'download'" label="Download" variant="outline" size="icon" class="size-11" @click="emit('action', 'download')"><Download class="size-4" /></IconButton>
    <IconButton v-else-if="download === 'zip'" label="Download as ZIP" variant="outline" size="icon" class="size-11" @click="emit('action', 'zip')"><FileArchive class="size-4" /></IconButton>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="outline" size="icon" class="size-11" title="Copy or move" aria-label="Copy or move"><Copy class="size-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        <DropdownMenuItem v-for="move in MOVES" :key="move.id" @click="emit('action', move.id)"><component :is="move.icon" class="h-3.5 w-3.5" /> {{ move.label }}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <IconButton v-if="activeGroupId" label="Make public" variant="outline" size="icon" class="size-11" @click="emit('action', 'access')"><Globe class="size-4" /></IconButton>
    <IconButton label="Delete" variant="outline" size="icon" class="size-11 text-destructive hover:text-destructive" @click="emit('action', 'delete')"><Trash2 class="size-4" /></IconButton>
    <IconButton label="Clear selection" variant="ghost" size="icon" class="size-11" @click="clearSelection"><X class="size-4" /></IconButton>
  </div>
</template>
