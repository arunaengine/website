<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import LookupBox from '@/components/metadata/LookupBox.vue'
import TypeBrowser from './TypeBrowser.vue'
import {
  addEntity,
  autoId,
  idHint,
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

const props = defineProps<{
  open: boolean
  draft: CrateDraft
  vocab: VocabIndex | null
  /** Property range: the type list starts narrowed to what it accepts. */
  range?: string[]
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'created', value: { draft: CrateDraft; entity: DraftEntity }): void
}>()

const type = ref('')
const onlyMatching = ref(Boolean(props.range?.length))
const name = ref('')
const identifier = ref('')
const idTouched = ref(false)
const importing = ref(false)
const lookupError = ref('')
const extra = ref<Record<string, DraftValue[]>>({})
const related = ref<ContextEntity[]>([])

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
  type.value = ''
  onlyMatching.value = Boolean(props.range?.length)
  name.value = ''
  identifier.value = ''
  idTouched.value = false
  lookupError.value = ''
  extra.value = {}
  related.value = []
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
  emit('created', created)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>Add an entity</DialogTitle>
        <DialogDescription>
          Search for the kind of thing this is, then give it a name. Everything in the dataset is
          described the same way.
        </DialogDescription>
      </DialogHeader>

      <div class="max-h-[60vh] space-y-5 overflow-y-auto px-1">
        <TypeBrowser
          v-model="type"
          v-model:only-matching="onlyMatching"
          :vocab="vocab"
          :range="range"
        />

        <div v-if="type" class="space-y-3 border-t border-border pt-4">
          <div>
            <label class="text-xs font-medium text-foreground">Name</label>
            <div v-if="registry" class="mt-1 space-y-2">
              <LookupBox
                v-model="name"
                :kind="registry.kind"
                aria-label="Name"
                :placeholder="`Search ${registry.label} by name, or paste an id`"
                @select="useHit"
              />
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
            <Input v-else v-model="name" class="mt-1" aria-label="Name" @keydown.enter="create" />
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
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button :disabled="!canCreate" @click="create">Create</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
