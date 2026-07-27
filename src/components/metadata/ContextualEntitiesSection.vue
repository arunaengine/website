<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from 'vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ContextualEntityCard from '@/components/metadata/ContextualEntityCard.vue'
import { contextualEntitiesOf, type ContextualGroup, type ContextualGroupKey } from '@/lib/contextualEntities'
import { relativeTime } from '@/lib/utils'
import {
  AppWindow,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  MapPin,
  MessageSquare,
  Scale,
  Shapes,
  Tags,
  Users,
} from '@lucide/vue'

// One surface for every contextual entity of the crate, in collapsible groups.
// Also carries the crate loading / not-ready notice (re-homed from the raw
// JSON-LD section, which now sits at the bottom of the page).
const props = defineProps<{
  crate: unknown
  documentId: string
  excludeIds?: Set<string>
  loading?: boolean
  preparing?: boolean
  notReady?: boolean
  error?: string | null
}>()
const emit = defineEmits<{ (e: 'retry'): void }>()

const groups = computed(() => contextualEntitiesOf(props.crate, { excludeIds: props.excludeIds }))
const total = computed(() => groups.value.reduce((sum, group) => sum + group.entities.length, 0))
const visible = computed(() => total.value > 0 || Boolean(props.loading) || Boolean(props.notReady) || Boolean(props.error))

const GROUP_ICONS: Record<ContextualGroupKey, Component> = {
  people: Users,
  organizations: Building2,
  publications: BookOpen,
  licenses: Scale,
  software: AppWindow,
  places: MapPin,
  terms: Tags,
  comments: MessageSquare,
  other: Shapes,
}

const DEFAULT_OPEN: Record<string, boolean> = { people: true, organizations: true }
const CARD_CAP = 8

const open = ref<Record<string, boolean>>({ ...DEFAULT_OPEN })
const expanded = ref<Record<string, boolean>>({})
const highlightId = ref('')
let highlightTimer: number | undefined

watch(
  () => props.documentId,
  () => {
    open.value = { ...DEFAULT_OPEN }
    expanded.value = {}
    highlightId.value = ''
  },
)

function toggle(key: ContextualGroupKey) {
  open.value = { ...open.value, [key]: !open.value[key] }
}

function cardsOf(group: ContextualGroup) {
  return expanded.value[group.key] ? group.entities : group.entities.slice(0, CARD_CAP)
}

// Affiliation click: open (and expand, when capped away) the target's group,
// then scroll to its card with a transient highlight ring.
function jumpTo(id: string) {
  for (const group of groups.value) {
    const index = group.entities.findIndex((entity) => entity.id === id)
    if (index < 0) continue
    open.value = { ...open.value, [group.key]: true }
    if (index >= CARD_CAP) expanded.value = { ...expanded.value, [group.key]: true }
    void nextTick(() => {
      document.getElementById(`ctx-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      highlightId.value = id
      window.clearTimeout(highlightTimer)
      highlightTimer = window.setTimeout(() => (highlightId.value = ''), 1800)
    })
    return
  }
}

// Malformed timestamps render verbatim instead of "NaNs ago".
function timeLabel(iso: string): string {
  return Number.isFinite(Date.parse(iso)) ? relativeTime(iso) : iso
}
</script>

<template>
  <section v-if="visible" class="surface overflow-hidden">
    <div class="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
      <Users class="h-4 w-4 text-primary" /> People and context
      <span v-if="total" class="text-xs font-normal text-muted-foreground">{{ total }}</span>
    </div>

    <div v-if="loading && !total" class="px-5 py-4">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div v-for="n in 3" :key="n" class="surface-muted flex flex-col gap-2 p-3">
          <Skeleton class="h-4 w-32" />
          <Skeleton class="h-3 w-24" />
          <Skeleton class="h-3 w-20" />
        </div>
      </div>
      <p class="mt-3 text-xs text-muted-foreground">{{ preparing ? 'Preparing the crate…' : 'Loading full RO-Crate…' }}</p>
    </div>

    <div v-else class="divide-y divide-border">
      <div v-if="notReady" class="flex items-center gap-3 px-5 py-4 text-xs text-muted-foreground">
        <span>The crate is still being prepared.</span>
        <Button variant="outline" size="sm" @click="emit('retry')">Retry</Button>
      </div>
      <p v-else-if="error" class="px-5 py-4 text-xs text-destructive">{{ error }}</p>

      <div v-for="group in groups" :key="group.key">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-medium text-foreground/80 hover:text-foreground"
          @click="toggle(group.key)"
        >
          <component :is="open[group.key] ? ChevronDown : ChevronRight" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <component :is="GROUP_ICONS[group.key]" class="h-4 w-4 shrink-0 text-primary/70" />
          {{ group.label }}
          <span class="text-xs font-normal text-muted-foreground">{{ group.entities.length }}</span>
        </button>

        <div v-if="open[group.key]" class="px-5 pb-4">
          <ul v-if="group.key === 'comments'" class="space-y-3">
            <li v-for="entity in cardsOf(group)" :key="entity.id" class="text-sm">
              <p class="whitespace-pre-wrap text-foreground/85">{{ entity.text || entity.name }}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                <span v-if="entity.authorName">{{ entity.authorName }}</span>
                <span v-if="entity.authorName && entity.created"> · </span>
                <span v-if="entity.created" :title="entity.created">{{ timeLabel(entity.created) }}</span>
              </p>
            </li>
          </ul>
          <div v-else class="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <ContextualEntityCard
              v-for="entity in cardsOf(group)"
              :key="entity.id"
              :entity="entity"
              :group="group.key"
              :highlight="highlightId === entity.id"
              @jump="jumpTo"
            />
          </div>
          <Button
            v-if="group.entities.length > CARD_CAP && !expanded[group.key]"
            variant="ghost"
            size="sm"
            class="mt-3"
            @click="expanded = { ...expanded, [group.key]: true }"
          >
            Show all {{ group.entities.length }}
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>
