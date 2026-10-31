<script setup lang="ts">
// The "more actions" menu of one row in the object list.
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import type { RowAction } from '@/lib/objectListing'
import { computed } from 'vue'
import { Copy, Download, Eye, Folder, FolderInput, Globe, Info, Ellipsis, Link2, Pencil, Share2, Trash2 } from '@lucide/vue'

const props = defineProps<{
  name: string
  folder?: boolean
  /** Why this session cannot change or delete the row, or null. */
  changeReason?: string | null
  /** Public access needs a group to hold the rule. */
  access?: boolean
  /** Share links work on ordinary buckets of a realm node. */
  links?: boolean
  /** Why this bucket cannot have share links; Share then shows disabled with it. */
  linkReason?: string | null
}>()
const emit = defineEmits<{ (e: 'pick', action: RowAction): void }>()

const ICONS = { open: Folder, details: Info, preview: Eye, download: Download, rename: Pencil, move: FolderInput, copy: Copy, share: Link2, 'share-link': Share2, access: Globe, delete: Trash2, purge: Trash2 }
const LABELS: Record<RowAction, string> = {
  open: 'Open',
  details: 'Details',
  preview: 'Preview',
  download: 'Download',
  rename: 'Rename',
  move: 'Move to',
  copy: 'Copy to',
  share: 'Copy link for members',
  'share-link': 'Share',
  access: 'Make public',
  delete: 'Delete',
  purge: 'Delete permanently…',
}

// A file row opens its details on a click, so its menu starts with what the row does not.
const groups = computed<RowAction[][]>(() => {
  const change: RowAction[] = props.folder ? ['copy', 'move'] : ['copy', 'move', 'share']
  if (props.links) change.unshift('share-link')
  if (props.access) change.push('access')
  return [props.folder ? ['open', 'details', 'rename'] : ['preview', 'download', 'rename'], change, ['delete', 'purge']]
})

function blocked(action: RowAction): boolean {
  if (action === 'share-link') return Boolean(props.linkReason)
  return Boolean(props.changeReason) && ['rename', 'move', 'delete', 'purge'].includes(action)
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <!-- A phone shows only this button, borderless, with a full touch target. -->
      <Button variant="outline" size="icon" class="h-8 w-8 @max-[600px]:size-11 @max-[600px]:border-transparent @max-[600px]:bg-transparent @max-[600px]:shadow-none" :title="`Actions for ${name}`" :aria-label="`Actions for ${name}`" @click.stop>
        <Ellipsis class="size-3.5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuLabel class="max-w-[12rem] truncate">{{ name }}</DropdownMenuLabel>
      <template v-for="(group, index) in groups" :key="index">
        <DropdownMenuSeparator v-if="index" />
        <template v-for="action in group" :key="action">
          <DropdownMenuItem
            :disabled="blocked(action)"
            :title="blocked(action) && action !== 'share-link' ? changeReason ?? undefined : undefined"
            :class="action === 'delete' || action === 'purge' ? 'text-destructive focus:text-destructive' : undefined"
            @click="emit('pick', action)"
          >
            <component :is="ICONS[action]" class="h-3.5 w-3.5" />
            {{ action === 'delete' && folder ? 'Delete folder' : LABELS[action] }}
          </DropdownMenuItem>
          <p v-if="action === 'share-link' && linkReason" class="max-w-[14rem] px-2 pb-1.5 pl-[1.875rem] text-xs text-muted-foreground">{{ linkReason }}</p>
        </template>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
