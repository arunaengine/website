<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { ArrowLeftRight, Boxes, Pin } from '@lucide/vue'

// One shared row for every bucket list surface (sidebar pins/locals, recently
// browsed, federated search hits): text-sm, py-2, primary Boxes icon, optional
// "on <node>" badge, optional sync glyph, and an always-visible pin toggle.
const props = withDefaults(
  defineProps<{
    bucket: string
    /** Hosting node; null = the connected node (no badge). */
    nodeId?: string | null
    pinned?: boolean
    /** Shows the ArrowLeftRight glyph for buckets with sync relationships. */
    synced?: boolean
    /** The currently opened bucket. */
    active?: boolean
    /** Keyboard highlight (combobox rows). */
    highlighted?: boolean
    /** Small muted second line (e.g. the owning group of a search hit). */
    subtitle?: string | null
    /** Render as a combobox option (role/aria-selected). */
    option?: boolean
    /** Open on mousedown so combobox rows beat the input blur. */
    openOnMousedown?: boolean
    /** Hide the pin toggle (picker dialogs). */
    pinnable?: boolean
  }>(),
  {
    nodeId: null,
    pinned: false,
    synced: false,
    active: false,
    highlighted: false,
    subtitle: null,
    option: false,
    openOnMousedown: false,
    pinnable: true,
  },
)

const emit = defineEmits<{ (e: 'open'): void; (e: 'toggle-pin'): void }>()

const realmNodes = useRealmNodes()

function onMousedown(event: MouseEvent) {
  if (!props.openOnMousedown) return
  event.preventDefault()
  emit('open')
}
function onClick() {
  if (!props.openOnMousedown) emit('open')
}
</script>

<template>
  <div class="flex items-center gap-1 rounded-sm pr-2">
    <Tooltip v-if="$slots.tooltip" side="right">
      <button
        type="button"
        :role="option ? 'option' : undefined"
        :aria-selected="option ? highlighted : undefined"
        class="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
        :class="active ? 'bg-muted font-medium text-foreground' : highlighted ? 'bg-muted text-foreground' : 'text-muted-foreground'"
        @mousedown="onMousedown"
        @click="onClick"
      >
        <Boxes class="h-3.5 w-3.5 shrink-0 text-primary" />
        <span class="min-w-0 flex-1">
          <span class="block truncate">{{ bucket }}</span>
          <span v-if="subtitle" class="block truncate text-[10px] font-normal text-muted-foreground">{{ subtitle }}</span>
        </span>
        <span class="flex shrink-0 items-center gap-1">
          <ArrowLeftRight
            v-if="synced"
            class="h-3 w-3 shrink-0 text-primary/60"
            aria-label="Sync relationships configured"
          />
          <Badge
            v-if="nodeId"
            variant="outline"
            class="shrink-0 text-[10px]"
            :title="`Stored on another node: ${nodeId}`"
          >
            on {{ realmNodes.displayName(nodeId) }}
          </Badge>
        </span>
      </button>
      <template #content><slot name="tooltip" /></template>
    </Tooltip>
    <button
      v-else
      type="button"
      :role="option ? 'option' : undefined"
      :aria-selected="option ? highlighted : undefined"
      class="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
      :class="active ? 'bg-muted font-medium text-foreground' : highlighted ? 'bg-muted text-foreground' : 'text-muted-foreground'"
      @mousedown="onMousedown"
      @click="onClick"
    >
      <Boxes class="h-3.5 w-3.5 shrink-0 text-primary" />
      <span class="min-w-0 flex-1">
        <span class="block truncate">{{ bucket }}</span>
        <span v-if="subtitle" class="block truncate text-[10px] font-normal text-muted-foreground">{{ subtitle }}</span>
      </span>
      <span class="flex shrink-0 items-center gap-1">
        <ArrowLeftRight
          v-if="synced"
          class="h-3 w-3 shrink-0 text-primary/60"
          aria-label="Sync relationships configured"
        />
        <Badge
          v-if="nodeId"
          variant="outline"
          class="shrink-0 text-[10px]"
          :title="`Stored on another node: ${nodeId}`"
        >
          on {{ realmNodes.displayName(nodeId) }}
        </Badge>
      </span>
    </button>

    <slot name="actions" />

    <button
      v-if="pinnable"
      type="button"
      class="shrink-0 rounded p-1"
      :class="pinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
      :title="pinned ? 'Unpin bucket' : 'Pin bucket'"
      :aria-label="pinned ? `Unpin ${bucket}` : `Pin ${bucket}`"
      @mousedown.prevent
      @click="emit('toggle-pin')"
    >
      <Pin class="h-3 w-3" :fill="pinned ? 'currentColor' : 'none'" />
    </button>
  </div>
</template>
