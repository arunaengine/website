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
import { Copy, Download, Folder, FolderInput, Globe, Info, MoreHorizontal, PencilLine, Trash2 } from '@lucide/vue'

const props = defineProps<{
  name: string
  folder?: boolean
  /** Why this session cannot change or delete the row, or null. */
  changeReason?: string | null
  /** Public access needs a group to hold the rule. */
  access?: boolean
}>()
const emit = defineEmits<{ (e: 'pick', action: RowAction): void }>()

const ICONS = { open: Folder, details: Info, download: Download, rename: PencilLine, move: FolderInput, copy: Copy, access: Globe, delete: Trash2 }
const LABELS: Record<RowAction, string> = {
  open: 'Open',
  details: 'Details',
  download: 'Download',
  rename: 'Rename',
  move: 'Move to',
  copy: 'Copy to',
  access: 'Change access',
  delete: 'Delete',
}

const groups = computed<RowAction[][]>(() => {
  const change: RowAction[] = props.folder ? ['move', 'copy'] : ['rename', 'move', 'copy']
  if (props.access) change.push('access')
  return [props.folder ? ['open', 'details'] : ['details', 'download'], change, ['delete']]
})

function blocked(action: RowAction): boolean {
  return Boolean(props.changeReason) && ['rename', 'move', 'delete'].includes(action)
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" title="More actions" aria-label="More actions" @click.stop>
        <MoreHorizontal class="size-3.5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuLabel class="max-w-[12rem] truncate">{{ name }}</DropdownMenuLabel>
      <template v-for="(group, index) in groups" :key="index">
        <DropdownMenuSeparator v-if="index" />
        <DropdownMenuItem
          v-for="action in group"
          :key="action"
          :disabled="blocked(action)"
          :title="blocked(action) ? changeReason ?? undefined : undefined"
          :class="action === 'delete' ? 'text-destructive focus:text-destructive' : undefined"
          @click="emit('pick', action)"
        >
          <component :is="ICONS[action]" class="h-3.5 w-3.5" />
          {{ action === 'delete' && folder ? 'Delete folder' : LABELS[action] }}
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
