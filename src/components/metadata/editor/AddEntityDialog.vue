<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import CommandPane from '@/components/ui/CommandPane.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import LookupBox from '@/components/metadata/LookupBox.vue'
import TypeBrowser from './TypeBrowser.vue'
import {
  addEntity,
  addValue,
  autoId,
  idHint,
  linkProperties,
  propertyKey,
  rootEntity,
  rootId,
  typeLabel,
  type CrateDraft,
  type DraftEntity,
  type DraftValue,
} from '@/lib/crate/editor'
import { fetchOrcidRecord, normalizeOrcidId } from '@/lib/lookup/orcid'
import { fetchRorRecord, normalizeRorId } from '@/lib/lookup/ror'
import type { ContextEntity, LookupHit, RegistryRecord } from '@/lib/lookup/types'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { errorMessage } from '@/lib/utils'

// Two steps in one dialog: search the type, then name the entity. A link from
// the dataset is offered, never assumed.
const props = defineProps<{
  open: boolean
  draft: CrateDraft
  vocab: VocabIndex | null
  /** Property range: the type list starts narrowed to what it accepts. */
  range?: string[]
  /** Contextual entities only: File, Dataset and MediaObject stay out. */
  excludeData?: boolean
  /** Offers to link the new entity from the root; nothing is linked unless picked. */
  offerLink?: boolean
  /** Opened from a property row: that row takes the link, so it is shown fixed. */
  linkedFrom?: { entity: string; property: string }
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'created', value: { draft: CrateDraft; entity: DraftEntity }): void
}>()

const query = ref('')
const type = ref('')
const onlyMatching = ref(Boolean(props.range?.length))
const name = ref('')
const identifier = ref('')
const idTouched = ref(false)
const importing = ref(false)
const lookupError = ref('')
const extra = ref<Record<string, DraftValue[]>>({})
const related = ref<ContextEntity[]>([])
// Empty means the entity is created without any link; a link is always a choice.
const linkAs = ref('')

const linkOptions = computed(() => {
  if (!props.offerLink || !type.value) return []
  const root = rootEntity(props.draft)
  return linkProperties(props.vocab, root?.types ?? [], [type.value])
    .map((term) => ({ value: propertyKey(term), label: term.label }))
})

// A type change drops a link that no longer fits the new type.
watch(linkOptions, (options) => {
  if (!options.some((option) => option.value === linkAs.value)) linkAs.value = ''
})

const registry = computed(() => {
  const label = typeLabel(type.value)
  if (label === 'Person') return { kind: 'person' as const, label: 'ORCID' }
  return label === 'Organization' ? { kind: 'organization' as const, label: 'ROR' } : null
})

// A typed ORCID or ROR id fetches the record instead of searching by name.
const typedId = computed(() => {
  if (!registry.value) return ''
  const value = name.value.trim()
  return (registry.value.kind === 'person' ? normalizeOrcidId(value) : normalizeRorId(value)) ?? ''
})

watch(() => props.open, (open) => {
  if (!open) return
  query.value = ''
  type.value = ''
  onlyMatching.value = Boolean(props.range?.length)
  name.value = ''
  identifier.value = ''
  idTouched.value = false
  lookupError.value = ''
  extra.value = {}
  related.value = []
  linkAs.value = ''
}, { immediate: true })

// The identifier follows the name until someone edits it themselves.
watch([name, type], () => {
  if (idTouched.value) return
  identifier.value = autoId(name.value || typeLabel(type.value), props.draft.entities.map((entity) => entity.id))
})

function text(value: string): DraftValue[] {
  return [{ kind: 'text', value }]
}

function applyRecord(record: RegistryRecord) {
  name.value = record.name
  identifier.value = record.id
  idTouched.value = true
  extra.value = {
    ...(record.givenName ? { givenName: text(record.givenName) } : {}),
    ...(record.familyName ? { familyName: text(record.familyName) } : {}),
    ...(record.url ? { url: [{ kind: 'url' as const, value: record.url }] } : {}),
  }
}

async function importRecord() {
  if (!typedId.value || !registry.value) return
  importing.value = true
  lookupError.value = ''
  try {
    applyRecord(registry.value.kind === 'person'
      ? await fetchOrcidRecord(typedId.value)
      : await fetchRorRecord(typedId.value))
  } catch (error) {
    lookupError.value = errorMessage(error)
  } finally {
    importing.value = false
  }
}

function useHit(hit: LookupHit) {
  const properties = hit.entity.properties
  const value = (key: string) => (typeof properties[key] === 'string' ? String(properties[key]) : '')
  applyRecord({
    id: hit.id,
    name: hit.label,
    ...(value('givenName') ? { givenName: value('givenName') } : {}),
    ...(value('familyName') ? { familyName: value('familyName') } : {}),
    ...(value('url') ? { url: value('url') } : {}),
  })
  const affiliation = properties.affiliation
  if (affiliation && typeof affiliation === 'object' && '@id' in affiliation) {
    extra.value = { ...extra.value, affiliation: [{ kind: 'reference', value: String(affiliation['@id']) }] }
  }
  related.value = hit.relatedEntities
}

const canCreate = computed(() => Boolean(type.value && identifier.value.trim()))

function create() {
  if (!canCreate.value) return
  let base = props.draft
  for (const entity of related.value) {
    const types = Array.isArray(entity.type) ? entity.type : [entity.type]
    const label = typeof entity.properties.name === 'string' ? entity.properties.name : ''
    base = addEntity(base, { type: types[0] ?? 'Thing', id: entity.id, name: label }).draft
  }
  const created = addEntity(base, {
    type: type.value,
    name: name.value,
    id: identifier.value,
    properties: extra.value,
  })
  const linked = linkAs.value
    ? addValue(created.draft, rootId(created.draft), linkAs.value, {
        kind: 'reference',
        value: created.entity.id,
      })
    : created.draft
  emit('created', { draft: linked, entity: created.entity })
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent v-if="!type" class="max-w-lg gap-0 overflow-hidden p-0">
      <div class="border-b border-border px-4 py-3 pr-10">
        <DialogTitle class="text-sm">Add an entity</DialogTitle>
        <DialogDescription class="mt-0.5 text-xs">
          Search for the kind of thing this is. Everything in the dataset is described the same way.
        </DialogDescription>
      </div>
      <CommandPane v-model="query" placeholder="Search every type" aria-label="Search entity types">
        <TypeBrowser
          v-model="type"
          v-model:only-matching="onlyMatching"
          :query="query"
          :vocab="vocab"
          :range="range"
          :exclude-data="excludeData"
        />
      </CommandPane>
    </DialogContent>

    <DialogContent v-else class="max-w-lg">
      <DialogHeader>
        <DialogTitle>Add {{ /^[aeiou]/i.test(typeLabel(type)) ? 'an' : 'a' }} {{ typeLabel(type) }}</DialogTitle>
        <DialogDescription>
          <button type="button" class="font-medium text-primary hover:underline" @click="type = ''">Change type</button>
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div>
          <label class="text-xs font-medium text-foreground">Name</label>
          <div v-if="registry" class="mt-1 space-y-2">
            <LookupBox
              v-model="name"
              :kind="registry.kind"
              aria-label="Name"
              :placeholder="`Search ${registry.label} by name or id`"
              @select="useHit"
            />
            <p class="text-[11px] text-muted-foreground">
              Search {{ registry.label }} by name or id, or simply type the name yourself.
            </p>
            <div v-if="typedId" class="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label="Import this record"
                :disabled="importing"
                @click="importRecord"
              >
                <Spinner v-if="importing" class="text-current" aria-hidden="true" />
                Use {{ registry.label }} {{ typedId }}
              </Button>
            </div>
            <Notice v-if="lookupError" tone="warning">{{ lookupError }}</Notice>
          </div>
          <Input v-else v-model="name" class="mt-1" aria-label="Name" autofocus @keydown.enter="create" />
        </div>

        <div>
          <label class="text-xs font-medium text-foreground">Identifier</label>
          <Input
            :model-value="identifier"
            class="mt-1 font-mono text-xs"
            aria-label="Identifier"
            @update:model-value="(value: string | number) => { identifier = String(value); idTouched = true }"
          />
          <p class="mt-1 text-[11px] text-muted-foreground">{{ idHint(type) }}</p>
        </div>

        <div v-if="linkedFrom" class="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Linked from <span class="font-medium text-foreground">{{ linkedFrom.entity }}</span>
          as <span class="font-medium text-foreground">{{ linkedFrom.property }}</span>.
        </div>
        <div v-else-if="offerLink && linkOptions.length">
          <label class="text-xs font-medium text-foreground">Link from the dataset as</label>
          <Select
            :model-value="linkAs"
            :options="[{ value: '', label: 'None' }, ...linkOptions]"
            class="mt-1"
            placeholder="None"
            aria-label="Link from the dataset as"
            @update:model-value="(value: string) => (linkAs = value)"
          />
          <p class="mt-1 text-[11px] text-muted-foreground">
            {{ linkAs ? 'The dataset will point at this entity.' : 'Nothing points at this entity until you pick a property.' }}
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button :disabled="!canCreate" @click="create">Create</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
