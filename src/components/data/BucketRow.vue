<script setup lang="ts">
import BucketJobLabel from '@/components/storage/BucketJobLabel.vue'
import Popover from '@/components/ui/Popover.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import type { BucketJob } from '@/lib/api'
import { ChevronDown, Database, Network, Package, Pin, RefreshCw, Server, TriangleAlert } from '@lucide/vue'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

// One shared row for every bucket list (the Data view, the bucket search, the databases): the kind
// icon, the name with its chips, a description line and a facts line that names the node. The name
// button covers the row; the pin and the row's actions show on hover or focus, a long press pins.
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
  }>(),
  {
    nodeId: null,
    nodeCount: 0,
    nodes: () => [],
    pinned: false,
    synced: false,
    job: null,
    degraded: false,
    active: false,
    highlighted: false,
    subtitle: null,
    facts: null,
    database: false,
    option: false,
    openOnMousedown: false,
    pinnable: true,
    place: null,
    placeTitle: null,
    placeNode: null,
  },
)

const emit = defineEmits<{ (e: 'open'): void; (e: 'toggle-pin'): void }>()

const realmNodes = useRealmNodes()

const spread = computed(() => props.nodes.length || props.nodeCount)
// The facts line names the node; a distributed bucket names its nodes in the chip instead.
const placeId = computed(() => (spread.value ? null : props.placeNode ?? props.nodeId))
const placeName = computed(() => (spread.value ? null : props.place ?? (props.nodeId ? realmNodes.displayName(props.nodeId) : null)))
const syncedTitle = computed(() => (props.linkedTo ? `Linked to ${props.linkedTo}` : 'Sync relationships configured'))

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
    class="group relative flex items-start gap-2.5 border-l-2 py-2 pl-3 pr-2 hover:bg-muted/60 has-[:focus-visible]:bg-muted/60"
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
        <span
          v-if="linkedTo || synced"
          class="relative inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 text-[11px] text-emerald-700 dark:text-emerald-300"
          :title="syncedTitle"
          :aria-label="syncedTitle"
          role="img"
          :tabindex="linkedTo ? 0 : undefined"
        ><RefreshCw class="h-2.5 w-2.5" aria-hidden="true" /> synced</span>
        <Popover v-if="nodes.length">
          <button type="button" class="relative inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground hover:text-foreground" :aria-label="`Stored on ${nodes.length} nodes`">
            <Network class="h-2.5 w-2.5" aria-hidden="true" /> {{ nodes.length }} nodes <ChevronDown class="h-2.5 w-2.5" aria-hidden="true" />
          </button>
          <template #content>
            <p class="text-xs font-medium text-foreground">Stored on</p>
            <ul class="mt-1 space-y-1 text-sm">
              <li v-for="id in nodes" :key="id">
                <RouterLink :to="{ name: 'node', params: { nodeId: id } }" class="text-primary hover:underline">{{ realmNodes.displayName(id) }}</RouterLink>
              </li>
            </ul>
          </template>
        </Popover>
        <span v-else-if="nodeCount" class="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground" :aria-label="`Stored on ${nodeCount} nodes`">
          <Network class="h-2.5 w-2.5" aria-hidden="true" /> {{ nodeCount }} nodes
        </span>
        <BucketJobLabel v-if="job" :job="job" class="relative" />
        <TriangleAlert
          v-if="degraded"
          class="h-3 w-3 shrink-0 text-amber-500"
          aria-label="Degraded: writes to part of this bucket are refused"
        />
      </div>
      <p v-if="subtitle" class="truncate text-xs text-muted-foreground">{{ subtitle }}</p>
      <p v-if="facts || placeName" class="flex min-w-0 flex-wrap items-center gap-x-1 text-xs tabular-nums text-muted-foreground">
        <span v-if="facts">{{ facts }}<template v-if="placeName">,</template></span>
        <span v-if="placeName" class="inline-flex min-w-0 items-center gap-1">
          <Server class="h-3 w-3 shrink-0" aria-hidden="true" />
          <RouterLink
            v-if="placeId"
            :to="{ name: 'node', params: { nodeId: placeId } }"
            class="relative truncate text-primary hover:underline"
            :title="placeTitle ?? undefined"
            @mousedown.prevent
          >{{ placeName }}</RouterLink>
          <span v-else class="truncate" :title="placeTitle ?? undefined">{{ placeName }}</span>
        </span>
      </p>
    </div>
    <div class="relative flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
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
    </div>
  </div>
</template>
