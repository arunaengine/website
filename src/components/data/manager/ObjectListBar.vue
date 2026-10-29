<script setup lang="ts">
// The one search box and the filter menu of the file list. Typing filters this folder; Enter
// searches the whole bucket, where a `column=value` matches a metadata column.
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import Input from '@/components/ui/Input.vue'
import type { DataManager } from '@/composables/useDataManager'
import { filtersChanged, type ListingShow } from '@/lib/objectListing'
import { useDebounceFn } from '@vueuse/core'
import { computed, watch } from 'vue'
import {
  Check,
  ListFilter,
  Search,
  X,
} from '@lucide/vue'

/** `wholeBucket`: the box drives the whole-bucket search, so the folder filter rests. */
const props = defineProps<{ manager: DataManager; wholeBucket?: boolean }>()
const emit = defineEmits<{
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
} = props.manager

const SHOW_OPTIONS: { value: ListingShow; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'files', label: 'Files only' },
  { value: 'folders', label: 'Folders only' },
]

const changed = computed(() => filtersChanged({ show: listShow.value, includeDeleted: showDeleted.value }))

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
  </div>
</template>
