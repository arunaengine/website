<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'
import { ListChecks, Plus, X } from '@lucide/vue'
import { propertyTermsForType, type PropertyTermOption } from '@/lib/profiles/propertyCatalog'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { normalizeTypeUri, sameSchemaOrgType } from '@/lib/profiles/uri'
import { draftProperty, trimmed, type DraftEntityRule, type ProfileBuilder } from './useProfileBuilder'

// Class-scoped bulk property add (plan 6.5): a searchable checklist of the
// properties applicable to this entity's class, each selection inserted as an
// ordinary MAY rule. The list is the CURATED catalog only: the bundled
// vocabulary carries no domain/class data (only range-derived kinds) and the
// remote terminology providers are search-only, so any broader list would fake
// class-scoping from text search — which plan 6.5 forbids. Terms already used
// on the shape are shown checked and disabled, so duplicates are impossible.
const props = defineProps<{
  builder: ProfileBuilder
  entity: DraftEntityRule
}>()

const open = ref(false)
const query = ref('')
const selected = ref<Set<string>>(new Set())
const searchInput = ref<InstanceType<typeof Input> | null>(null)

const typeLabel = computed(() => entityTypeLabel(props.entity.type))

function isUsed(uri: string): boolean {
  return props.entity.properties.some((property) => sameSchemaOrgType(trimmed(property.propertyUri), uri))
}

const options = computed(() => {
  const q = trimmed(query.value).toLowerCase()
  return propertyTermsForType(props.entity.type)
    .filter(
      (option) =>
        !q ||
        option.name.toLowerCase().includes(q) ||
        option.label.toLowerCase().includes(q) ||
        option.description.toLowerCase().includes(q),
    )
    .map((option) => ({ option, used: isUsed(option.uri) }))
})

const selectedCount = computed(() => selected.value.size)

async function show() {
  open.value = true
  selected.value = new Set()
  await nextTick()
  const el = searchInput.value?.$el as HTMLElement | undefined
  ;(el?.matches?.('input') ? (el as HTMLInputElement) : el?.querySelector?.('input'))?.focus()
}

function close() {
  open.value = false
  query.value = ''
  selected.value = new Set()
}

function toggle(option: PropertyTermOption, checked: boolean) {
  if (isUsed(option.uri)) return
  const next = new Set(selected.value)
  if (checked) next.add(option.uri)
  else next.delete(option.uri)
  selected.value = next
}

// A property valueName unique within the owner AND the current batch.
function uniqueValueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}${n}`)) n++
  return `${base}${n}`
}

function addSelected() {
  const taken = new Set(props.entity.properties.map((property) => trimmed(property.valueName)))
  let lastUid: number | null = null
  for (const option of propertyTermsForType(props.entity.type)) {
    if (!selected.value.has(option.uri) || isUsed(option.uri)) continue
    const valueName = uniqueValueName(option.name, taken)
    taken.add(valueName)
    const draft = draftProperty({
      id: option.name,
      label: option.label,
      valueName,
      propertyUri: option.uri,
      description: option.description,
      // A catalog cannot decide profile policy: every bulk-added rule starts MAY.
      kind: option.suggestedKind ?? 'text',
      entityTypes: (option.suggestedEntityTypes ?? []).map(normalizeTypeUri).filter(Boolean),
      obligation: 'MAY',
    })
    props.entity.properties.push(draft)
    lastUid = draft.uid
  }
  if (lastUid !== null) props.builder.highlightPropertyUid = lastUid
  close()
}
</script>

<template>
  <div>
    <Button v-if="!open" type="button" variant="outline" size="sm" @click="show">
      <ListChecks class="size-3.5" /> Add common properties
    </Button>

    <div v-else class="space-y-3 rounded-lg border border-border bg-card p-3">
      <div class="flex items-center gap-2">
        <Input
          ref="searchInput"
          v-model="query"
          class="flex-1"
          :placeholder="`Filter common ${typeLabel} properties`"
          :aria-label="`Filter common ${typeLabel} properties`"
          @keydown.escape.prevent="close"
        />
        <Button type="button" variant="ghost" size="sm" aria-label="Close property checklist" @click="close">
          <X class="size-3.5" />
        </Button>
      </div>

      <p class="text-[11px] text-muted-foreground">
        Curated properties for {{ typeLabel }}; each selection is added as an Optional rule you can adjust afterwards.
        Properties already on this shape are checked and locked.
      </p>

      <div v-if="options.length" class="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border px-3 py-2 scrollbar-thin">
        <label
          v-for="{ option, used } in options"
          :key="option.uri"
          class="flex items-start gap-2 text-xs"
          :class="used ? 'text-muted-foreground' : 'text-foreground'"
        >
          <input
            type="checkbox"
            class="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
            :checked="used || selected.has(option.uri)"
            :disabled="used"
            @change="toggle(option, ($event.target as HTMLInputElement).checked)"
          />
          <span class="min-w-0">
            <span class="font-medium">{{ option.label }}</span>
            <code class="ml-1 rounded bg-muted px-1 text-[10px]">{{ option.name }}</code>
            <span v-if="used" class="ml-1 text-[10px]">(already added)</span>
            <span class="block text-[11px] text-muted-foreground">{{ option.description }}</span>
          </span>
        </label>
      </div>
      <p v-else class="rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
        No common properties match "{{ query }}".
      </p>

      <div class="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" :disabled="!selectedCount" @click="addSelected">
          <Plus class="size-3.5" /> Add {{ selectedCount || '' }} {{ selectedCount === 1 ? 'property' : 'properties' }}
        </Button>
        <Button type="button" variant="ghost" size="sm" @click="close">Cancel</Button>
      </div>
    </div>
  </div>
</template>
