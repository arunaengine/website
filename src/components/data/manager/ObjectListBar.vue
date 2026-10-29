<script setup lang="ts">
// The bar on top of the object list: the one search box and the filter menu on
// the left, the actions for the ticked rows on the right. Typing filters this
// folder; Enter, or any `column=value`, searches the whole bucket. Its height is fixed,
// so ticking a row never moves the list; narrow screens scroll it sideways.
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import type { DataManager } from '@/composables/useDataManager'
import { actionBlocker, filtersChanged, type ListingShow, type SelectionAction } from '@/lib/objectListing'
import { useDebounceFn } from '@vueuse/core'
import { computed, watch } from 'vue'
import {
  Check,
  Copy,
  Download,
  FolderInput,
  Globe,
  ListFilter,
  PencilLine,
  Search,
  Trash2,
  X,
} from '@lucide/vue'

/** `wholeBucket`: the box drives the whole-bucket search, so the folder filter rests. */
const props = defineProps<{ manager: DataManager; wholeBucket?: boolean }>()
const emit = defineEmits<{
  (e: 'action', action: SelectionAction): void
  (e: 'search-bucket'): void
  (e: 'back'): void
}>()
const text = defineModel<string>('text', { default: '' })

const {
  nameFilter,
  listShow,
  resetFilters,
  showDeleted,
  setShowDeleted,
  remoteNodeId,
  activeGroupId,
  selectedObjectKeys,
  selectedPrefixes,
  selectedCount,
  clearSelection,
} = props.manager

const SHOW_OPTIONS: { value: ListingShow; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'files', label: 'Files only' },
  { value: 'folders', label: 'Folders only' },
]

const ACTIONS = [
  { id: 'download', label: 'Download', icon: Download },
  { id: 'move', label: 'Move to', icon: FolderInput },
  { id: 'copy', label: 'Copy to', icon: Copy },
  { id: 'rename', label: 'Rename', icon: PencilLine },
  { id: 'access', label: 'Access', icon: Globe },
  { id: 'delete', label: 'Delete', icon: Trash2 },
] as const

const actions = computed(() => ACTIONS.filter((action) => action.id !== 'access' || activeGroupId.value))
const changed = computed(() => filtersChanged({ show: listShow.value, includeDeleted: showDeleted.value }))

function blocker(action: SelectionAction): string | null {
  return actionBlocker(action, selectedObjectKeys.value.size, selectedPrefixes.value.size)
}

// Typing waits for a pause before the folder is listed again; a `column=value` never filters it.
let applied = nameFilter.value
const applyText = useDebounceFn((value: string) => {
  applied = value
  nameFilter.value = value
}, 300)
watch(text, (value) => {
  if (!props.wholeBucket) void applyText(value.includes('=') ? '' : value)
})
// Only a change from outside, such as a folder switch, replaces the typed text.
watch(nameFilter, (value) => {
  if (value !== applied) text.value = applied = value
})

function clearText() {
  if (props.wholeBucket) return emit('back')
  text.value = ''
  nameFilter.value = ''
}

function onEscape() {
  if (props.wholeBucket) emit('back')
}
</script>

<template>
  <div class="flex h-12 items-center gap-2 overflow-x-auto border-b border-border bg-muted/50 px-4 text-xs md:overflow-visible">
    <form class="relative w-80 min-w-40 shrink" @submit.prevent="emit('search-bucket')">
      <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        v-model="text"
        placeholder="Filter this folder, Enter searches the bucket"
        aria-label="Filter this folder or search the bucket"
        class="h-8 pl-8 pr-7 text-xs"
        @keydown.esc="onEscape"
      />
      <button
        v-if="text"
        type="button"
        aria-label="Clear filter"
        class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        @click="clearText"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </form>
    <DropdownMenu>
      <span class="relative inline-flex shrink-0">
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="icon" class="h-8 w-8" title="Filters" aria-label="Filters">
            <ListFilter class="h-4 w-4" :class="changed ? 'text-primary' : ''" />
          </Button>
        </DropdownMenuTrigger>
      </span>
      <DropdownMenuContent side="right" align="start">
        <DropdownMenuLabel>Show</DropdownMenuLabel>
        <DropdownMenuItem
          v-for="option in SHOW_OPTIONS"
          :key="option.value"
          role="menuitemradio"
          :aria-checked="listShow === option.value"
          class="pl-8"
          @click="listShow = option.value"
        >
          <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
            <Check v-if="listShow === option.value" class="h-3.5 w-3.5" />
          </span>
          {{ option.label }}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <!-- Deleted keys are listed by the node that holds the bucket. -->
        <DropdownMenuItem
          role="menuitemcheckbox"
          :aria-checked="showDeleted"
          :disabled="Boolean(remoteNodeId)"
          class="pl-8"
          @click="setShowDeleted(!showDeleted)"
        >
          <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
            <Check v-if="showDeleted" class="h-3.5 w-3.5" />
          </span>
          <span>
            Include deleted
            <span v-if="remoteNodeId" class="block text-xs text-muted-foreground">Only on the node that holds this bucket.</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem class="pl-8" :disabled="!changed" @click="resetFilters">Reset filters</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <span class="flex-1" />
    <span class="flex w-28 shrink-0 items-center justify-end gap-1" :class="selectedCount ? '' : 'invisible'">
      <span class="text-muted-foreground">{{ selectedCount }} selected</span>
      <IconButton label="Clear selection" class="text-muted-foreground" @click="clearSelection">
        <X class="size-3.5" />
      </IconButton>
    </span>
    <span class="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
    <div class="flex shrink-0 items-center gap-1">
      <IconButton
        v-for="action in actions"
        :key="action.id"
        :label="action.label"
        :disabled-reason="blocker(action.id)"
        :class="action.id === 'delete' ? 'text-destructive hover:text-destructive' : undefined"
        @click="emit('action', action.id)"
      >
        <component :is="action.icon" class="size-3.5" />
      </IconButton>
    </div>
  </div>
</template>
