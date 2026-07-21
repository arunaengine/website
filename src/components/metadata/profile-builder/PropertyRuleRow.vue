<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import Select from '@/components/ui/Select.vue'
import Button from '@/components/ui/Button.vue'
import PropertyRuleCard from './PropertyRuleCard.vue'
import { ChevronDown, ChevronRight, CornerDownRight, ListPlus, Lock, Trash2 } from '@lucide/vue'
import { OBLIGATION_ACCENT, PROFILE_VALUE_KIND_LABELS } from '@/lib/profiles/labels'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { normalizeTypeUri, sameSchemaOrgType } from '@/lib/profiles/uri'
import { obligationEditDisabled, obligationOptionsFor, type DraftEntityRule, type DraftPropertyRule, type ProfileBuilder } from './useProfileBuilder'
import type { ProfileObligation } from '@/lib/profiles/types'

// One compact, sentence-like rule row (plan 6.2): obligation, label, value/target
// summary, a link into the shared target shape for entity rules, and a
// disclosure that opens the full editor (PropertyRuleCard). The default surface
// carries only the primary decisions; everything else lives in the card.
const props = defineProps<{
  builder: ProfileBuilder
  entity: DraftEntityRule
  property: DraftPropertyRule
}>()
const emit = defineEmits<{ (e: 'remove'): void }>()

const expanded = ref(false)
const rowEl = ref<HTMLElement | null>(null)

// A freshly inserted rule (picker, quick action) expands and scrolls into view.
watch(
  () => props.builder.highlightPropertyUid,
  async (uid) => {
    if (uid !== props.property.uid) return
    expanded.value = true
    await nextTick()
    rowEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  },
  { immediate: true },
)

// Mirror the RO-Crate baseline clamp in the UI: name/description are fixed
// MUST (select disabled), license/datePublished only offer MUST and SHOULD.
// Without this the select could show a choice normalize silently overrides.
const obligationDisabled = computed(() => obligationEditDisabled(props.property))
const obligationOptions = computed(() => obligationOptionsFor(props.property))

const obligationModel = computed<ProfileObligation>({
  get: () => props.property.obligation,
  set: (value) => {
    props.property.obligation = value
  },
})

const isEntityKind = computed(() => props.property.kind === 'entity')

// The shared shape this entity-valued rule points at, when the profile has one.
const targetRule = computed<DraftEntityRule | undefined>(() => {
  if (!isEntityKind.value) return undefined
  for (const target of props.property.entityTypes) {
    const uri = normalizeTypeUri(target)
    const match = props.builder.entities.find((entity) => sameSchemaOrgType(normalizeTypeUri(entity.type), uri))
    if (match) return match
  }
  return undefined
})

const targetLabel = computed(() => {
  const first = props.property.entityTypes[0]
  return targetRule.value?.label || (first ? entityTypeLabel(first) : 'entity')
})

const summary = computed(() => {
  const listSuffix = props.property.multipleValues || props.property.kind === 'keyword-list' ? ', list' : ''
  if (isEntityKind.value) {
    const extra = props.property.entityTypes.length > 1 ? ` +${props.property.entityTypes.length - 1}` : ''
    return `→ ${targetLabel.value}${extra}${listSuffix}`
  }
  return `${PROFILE_VALUE_KIND_LABELS[props.property.kind]}${listSuffix}`
})

function scrollToShape(uid: number) {
  document.getElementById(`shape-${uid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Navigate to the shared target shape; create exactly one when none exists yet
// (plan Phase 3: one reusable shape per target type, navigation not copies).
async function goToTarget() {
  const existing = targetRule.value
  if (existing) {
    scrollToShape(existing.uid)
    return
  }
  const first = props.property.entityTypes[0]
  if (!first) return
  props.builder.addEntityRuleForType(first, entityTypeLabel(first))
  await nextTick()
  const created = props.builder.entities.find((entity) =>
    sameSchemaOrgType(normalizeTypeUri(entity.type), normalizeTypeUri(first)),
  )
  if (created) scrollToShape(created.uid)
}
</script>

<template>
  <div ref="rowEl" class="rounded-lg border border-border border-l-2 bg-background" :class="OBLIGATION_ACCENT[property.obligation]">
    <div class="flex items-center gap-2 px-2.5 py-1.5">
      <div :class="obligationDisabled ? 'opacity-60' : ''">
        <Select
          v-model="obligationModel"
          :options="obligationOptions"
          :disabled="obligationDisabled"
          class="h-7 w-[132px] text-[11px]"
          :aria-label="`Obligation for ${property.label || 'untitled property'}`"
        />
      </div>
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <span class="truncate text-sm font-medium text-foreground">{{ property.label || 'Untitled property' }}</span>
        <span class="truncate text-[11px] text-muted-foreground">{{ summary }}</span>
      </button>
      <button
        v-if="isEntityKind && property.entityTypes.length"
        type="button"
        class="hidden shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-aruna-royal/60 hover:text-foreground sm:flex"
        :title="targetRule ? `Go to the shared ${targetLabel} rules` : `Define the rules that apply when a new ${targetLabel} is described`"
        @click="goToTarget"
      >
        <template v-if="targetRule"><CornerDownRight class="size-3" /> {{ targetLabel }} rules</template>
        <template v-else><ListPlus class="size-3" /> Add {{ targetLabel }} rules</template>
      </button>
      <Lock v-if="property.lock" class="size-3.5 shrink-0 text-muted-foreground" :title="property.lock === 'full' ? 'RO-Crate baseline rule (fixed)' : 'RO-Crate baseline rule (identity fixed)'" />
      <Button
        v-if="!property.lock"
        type="button"
        variant="ghost"
        size="icon-sm"
        class="shrink-0 text-muted-foreground hover:text-destructive"
        :aria-label="`Remove ${property.label || 'property'}`"
        @click="emit('remove')"
      >
        <Trash2 class="size-3.5" />
      </Button>
      <button
        type="button"
        class="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        :aria-expanded="expanded"
        :aria-label="expanded ? 'Collapse details' : 'Edit details'"
        @click="expanded = !expanded"
      >
        <ChevronDown v-if="expanded" class="size-4" />
        <ChevronRight v-else class="size-4" />
      </button>
    </div>

    <div v-if="expanded" class="border-t border-border p-2.5">
      <PropertyRuleCard
        :builder="builder"
        :property="property"
        :entity-type-name="entityTypeLabel(entity.type)"
        :owner-type="entity.type"
        :slug="builder.slug"
        @remove="emit('remove')"
      />
    </div>
  </div>
</template>
