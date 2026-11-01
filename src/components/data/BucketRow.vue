<script setup lang="ts">
import BucketJobLabel from '@/components/storage/BucketJobLabel.vue'
import Popover from '@/components/ui/Popover.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import type { BucketJob } from '@/lib/api'
import type { UsageParts } from '@/composables/useBucketUsage'
import { Database, Files, FolderSync, Globe, HardDrive, Link2, Network, Package, Pin, Server, TriangleAlert } from '@lucide/vue'
import { computed, onMounted, ref, watch, type Component } from 'vue'
import { RouterLink } from 'vue-router'

// One shared row for every bucket list (the Data view, the bucket search, the databases): the kind
// icon, the name, a description line and the files and size. Where the bucket lives and its syncs
// are small icons at the right: a tooltip on hover and focus, a popover with node links on a click
// or tap. The name button covers the row; the pin shows on hover or focus, a long press pins.
const props = withDefaults(
  defineProps<{
    bucket: string
    /** Hosting node; null = the connected node. */
    nodeId?: string | null
    /** Nodes a distributed bucket is stored on; 0 for an ordinary bucket. */
    nodeCount?: number
    /** The nodes of a distributed bucket, named in the chip's popover. */
    nodes?: string[]
    pinned?: boolean
    /** The bucket has sync relationships. */
    synced?: boolean
    /** The nodes it syncs with, named in the sync icon. */
    syncedWith?: string[]
    /** The step running on the bucket, if any. */
    job?: BucketJob | null
    /** Writes to part of the bucket are refused right now. */
    degraded?: boolean
    /** The currently opened bucket. */
    active?: boolean
    /** Keyboard highlight (combobox rows). */
    highlighted?: boolean
    /** Muted second line: a database's description or a hit's group. */
    subtitle?: string | null
    /** Files and size, for example "16 files, 50.2 MB". */
    facts?: string | null
    /** Files and sizes shown with icons on one line; replaces `facts` when set. */
    parts?: UsageParts | null
    /** The bucket is a database; it shows the database icon. */
    database?: boolean
    /** Render as a combobox option (role/aria-selected). */
    option?: boolean
    /** Open on mousedown so combobox rows beat the input blur. */
    openOnMousedown?: boolean
    /** Hide the pin toggle (picker dialogs). */
    pinnable?: boolean
    /** The node named on the facts line; its title names kind and id. */
    place?: string | null
    placeTitle?: string | null
    placeNode?: string | null
    /** Desktop: the linked folder's name; null for a bucket without a link. */
    linkedTo?: string | null
    /** A public role lets everyone read the whole bucket. */
    isPublic?: boolean
  }>(),
  {
    nodeId: null,
    nodeCount: 0,
    nodes: () => [],
    pinned: false,
    synced: false,
    syncedWith: () => [],
    job: null,
    degraded: false,
    active: false,
    highlighted: false,
    subtitle: null,
    facts: null,
    parts: null,
    database: false,
    option: false,
    openOnMousedown: false,
    pinnable: true,
    place: null,
    placeTitle: null,
    placeNode: null,
    isPublic: false,
  },
)

const emit = defineEmits<{ (e: 'open'): void; (e: 'toggle-pin'): void }>()

const realmNodes = useRealmNodes()

// "A", "A and B", "A, B and C".
const names = (list: string[]) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : (list[0] ?? ''))

interface Mark {
  id: string
  icon: Component
  tooltip: string
  heading: string
  links: string[]
  /** A line for the popover when there is no node to link. */
  note?: string
}
const marks = computed<Mark[]>(() => {
  const list: Mark[] = []
  if (props.isPublic) list.push({ id: 'public', icon: Globe, tooltip: 'Public', heading: 'Public', links: [], note: 'Everyone can read this bucket' })
  if (props.linkedTo) {
    list.push({ id: 'sync', icon: FolderSync, tooltip: 'Synced with this computer', heading: 'Synced with this computer', links: [], note: `Folder ${props.linkedTo}` })
  } else if (props.synced) {
    const partners = props.syncedWith.map((id) => realmNodes.displayName(id))
    const tooltip = partners.length ? `Synced with ${names(partners)}` : 'Synced with another bucket'
    list.push({ id: 'sync', icon: FolderSync, tooltip, heading: 'Synced with', links: props.syncedWith, note: partners.length ? undefined : 'Another bucket on the same node' })
  }
  if (props.nodes.length) {
    list.push({ id: 'spread', icon: Network, tooltip: `Spread over ${names(props.nodes.map((id) => realmNodes.displayName(id)))}`, heading: 'Spread over', links: props.nodes })
  } else if (props.nodeCount) {
    list.push({ id: 'spread', icon: Network, tooltip: `Spread over ${props.nodeCount} nodes`, heading: 'Spread over', links: [], note: `${props.nodeCount} nodes` })
  } else {
    const id = props.placeNode ?? props.nodeId
    const name = props.place ?? (props.nodeId ? realmNodes.displayName(props.nodeId) : null)
    if (name) list.push({ id: 'place', icon: Server, tooltip: `Stored on ${name}`, heading: 'Stored on', links: id ? [id] : [], note: id ? undefined : name })
  }
  return list
})
const linkName = (id: string) => (id === (props.placeNode ?? props.nodeId) && props.place ? props.place : realmNodes.displayName(id))

// The open bucket's row scrolls into view when it is opened or listed.
const rowEl = ref<HTMLElement | null>(null)
const reveal = () => props.active && rowEl.value?.scrollIntoView?.({ block: 'nearest' })
onMounted(reveal)
watch(() => props.active, reveal, { flush: 'post' })

// A press held for half a second pins the row, and the click that follows does not open it.
let pressTimer: ReturnType<typeof setTimeout> | undefined
const pressed = ref(false)
function onPointerdown(event: PointerEvent) {
  if (!props.pinnable || event.pointerType === 'mouse') return
  pressed.value = false
  pressTimer = setTimeout(() => {
    pressed.value = true
    emit('toggle-pin')
  }, 500)
}
function endPress() {
  clearTimeout(pressTimer)
}

function onMousedown(event: MouseEvent) {
  if (!props.openOnMousedown) return
  event.preventDefault()
  emit('open')
}
function onClick() {
  if (pressed.value) return void (pressed.value = false)
  if (!props.openOnMousedown) emit('open')
}
</script>

<template>
  <div
    ref="rowEl"
    class="group relative grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-start gap-x-2.5 border-l-2 py-2 pl-3 pr-2 hover:bg-muted/60 has-[:focus-visible]:bg-muted/60"
    :class="[active ? 'border-primary bg-muted' : 'border-transparent', highlighted && !active ? 'bg-muted/60' : '']"
    @pointerdown="onPointerdown"
    @pointerup="endPress"
    @pointerleave="endPress"
    @pointercancel="endPress"
    @contextmenu="pressed && $event.preventDefault()"
  >
    <component :is="database ? Database : Package" class="mt-0.5 h-4 w-4 shrink-0" :class="database ? 'text-primary' : 'text-muted-foreground'" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-1.5">
        <Tooltip v-if="$slots.tooltip" side="right">
          <button
            type="button"
            :role="option ? 'option' : undefined"
            :aria-selected="option ? highlighted : undefined"
            class="min-w-0 truncate text-left text-sm text-foreground outline-none after:absolute after:inset-0 after:content-['']"
            :class="active ? 'font-medium' : ''"
            @mousedown="onMousedown"
            @click="onClick"
          >{{ bucket }}</button>
          <template #content><slot name="tooltip" /></template>
        </Tooltip>
        <button
          v-else
          type="button"
          :role="option ? 'option' : undefined"
          :aria-selected="option ? highlighted : undefined"
          class="min-w-0 truncate text-left text-sm text-foreground outline-none after:absolute after:inset-0 after:content-['']"
          :class="active ? 'font-medium' : ''"
          @mousedown="onMousedown"
          @click="onClick"
        >{{ bucket }}</button>
        <BucketJobLabel v-if="job" :job="job" class="relative" />
        <TriangleAlert
          v-if="degraded"
          class="h-3 w-3 shrink-0 text-amber-500"
          aria-label="Degraded: writes to part of this bucket are refused"
        />
      </div>
      <p v-if="subtitle" class="truncate text-xs text-muted-foreground">{{ subtitle }}</p>
      <p v-if="!parts && facts" class="text-xs tabular-nums text-muted-foreground">{{ facts }}</p>
    </div>
    <div class="relative flex shrink-0 items-center gap-0.5">
      <Popover v-for="mark in marks" :key="mark.id" :tooltip="mark.tooltip" align="end">
        <button
          type="button"
          class="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted"
          :class="mark.id === 'sync' ? 'text-aruna-navy dark:text-aruna-aqua' : 'text-muted-foreground hover:text-foreground'"
          :aria-label="mark.tooltip"
          @mousedown.prevent
        >
          <component :is="mark.icon" class="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <template #content>
          <p class="text-xs font-medium text-foreground">{{ mark.heading }}</p>
          <ul v-if="mark.links.length" class="mt-1 space-y-1 text-sm">
            <li v-for="id in mark.links" :key="id">
              <RouterLink :to="{ name: 'node', params: { nodeId: id } }" class="text-primary hover:underline" :title="mark.id === 'place' ? placeTitle ?? undefined : undefined">{{ linkName(id) }}</RouterLink>
            </li>
          </ul>
          <p v-if="mark.note" class="mt-1 text-sm text-muted-foreground">{{ mark.note }}</p>
        </template>
      </Popover>
    </div>
    <div v-if="$slots.link || $slots.actions || $slots.handle || pinnable" class="relative flex shrink-0 items-center gap-0.5">
      <slot v-if="!linkedTo" name="link" />
      <slot name="actions" />
      <button
        v-if="pinnable"
        type="button"
        class="rounded p-1 hover:bg-muted"
        :class="pinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
        :title="pinned ? 'Unpin bucket' : 'Pin bucket'"
        :aria-label="pinned ? `Unpin ${bucket}` : `Pin ${bucket}`"
        @mousedown.prevent
        @click="emit('toggle-pin')"
      >
        <Pin class="h-3.5 w-3.5" :fill="pinned ? 'currentColor' : 'none'" />
      </button>
      <slot name="handle" />
    </div>
    <p v-if="parts" class="flex min-w-0 items-center gap-2.5 [grid-column:2/-1] overflow-hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground">
      <span class="inline-flex shrink-0 items-center gap-1" :title="`${parts.files} files`"><Files class="h-3 w-3" aria-hidden="true" /><span class="sr-only">Files: </span>{{ parts.files }}</span>
      <span v-if="parts.stored" class="inline-flex shrink-0 items-center gap-1" :title="`${parts.stored} stored`"><HardDrive class="h-3 w-3" aria-hidden="true" /><span class="sr-only">Stored: </span>{{ parts.stored }}</span>
      <span v-if="parts.referenced" class="inline-flex shrink-0 items-center gap-1" :title="`${parts.referenced} referenced`"><Link2 class="h-3 w-3" aria-hidden="true" /><span class="sr-only">Referenced: </span>{{ parts.referenced }}</span>
    </p>
  </div>
</template>
