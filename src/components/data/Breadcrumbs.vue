<script setup lang="ts">
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import { computed } from 'vue'
import { Folder } from '@lucide/vue'

// The bucket, then the open folder's path. A deep path shows the parent and the open folder;
// the "…" menu holds the folders between. Long names truncate instead of wrapping.
const props = defineProps<{ path: string; bucket: string; singleLine?: boolean }>()
const emit = defineEmits<{
  (e: 'navigate', path: string): void
}>()

const parts = computed(() => (props.path ? props.path.split('/') : []))
const crumbs = computed(() => parts.value.map((name, index) => ({ name, path: parts.value.slice(0, index + 1).join('/') })))
const hidden = computed(() => crumbs.value.slice(0, -2))
const shown = computed(() => crumbs.value.slice(-2))
</script>

<template>
  <nav aria-label="Folder path" class="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground" :class="singleLine ? 'flex-nowrap' : 'flex-wrap'">
    <!-- The bucket root is plain text where it is open, a link only inside a folder. -->
    <span v-if="!parts.length" class="min-w-0 shrink truncate text-foreground" aria-current="page" :title="bucket">{{ bucket }}</span>
    <button
      v-else
      type="button"
      class="min-w-0 shrink truncate text-primary hover:underline"
      :title="bucket"
      @click="emit('navigate', '')"
    >{{ bucket }}</button>
    <template v-if="hidden.length">
      <span aria-hidden="true">/</span>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button type="button" class="shrink-0 px-0.5 text-primary hover:underline" :title="hidden.map((crumb) => crumb.name).join(' / ')" aria-label="Show the folders between">…</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem v-for="crumb in hidden" :key="crumb.path" @click="emit('navigate', crumb.path)">
            <Folder class="h-3.5 w-3.5 text-muted-foreground" /> {{ crumb.name }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </template>
    <template v-for="(crumb, index) in shown" :key="crumb.path">
      <span aria-hidden="true">/</span>
      <span v-if="index === shown.length - 1" class="truncate text-foreground" aria-current="page" :title="crumb.name">{{ crumb.name }}</span>
      <button v-else type="button" class="min-w-0 truncate text-primary hover:underline" :title="crumb.name" @click="emit('navigate', crumb.path)">
        {{ crumb.name }}
      </button>
    </template>
  </nav>
</template>
