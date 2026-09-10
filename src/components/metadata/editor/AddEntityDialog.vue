<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
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
  type TypeOption,
  addEntity,
  autoId,
  displayName,
  findEntity,
  findSimilarEntity,
  idHint,
  linkProperties,
  propertyKey,
  propertyTerm,
  rootEntity,
  rootId,
  typeLabel,
  vocabTypeUri,
  type CrateDraft,
  type DraftEntity,
  type DraftValue,
} from '@/lib/crate/editor'
import { linkReference } from '@/lib/crate/references'
import { copyEntity, entitiesOfType, referenceKey } from '@/lib/crate/registry'
import { findCandidates, findRecentCandidates, resolveReference, type ReuseCandidate, type ReuseSearch } from '@/composables/useEntityRegistry'
import { useAruna } from '@/composables/useAruna'
import { isAbsoluteUri } from '@/lib/profiles/uri'
import { isDataEntity } from '@/lib/dataEntities'
import { defaultProperties, defaultRows } from '@/lib/crate/typeDefaults'
import { fetchOrcidRecord, normalizeOrcidId } from '@/lib/lookup/orcid'
import { fetchRorRecord, matchRorByName, normalizeRorId } from '@/lib/lookup/ror'
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
  /** The types the picked profile describes, offered first. */
  profileTypes?: TypeOption[]
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
// A ROR match belongs to the hit it was started for, and to no later one.
let hitToken = 0

// Recency bounds suggestions; each query can continue through all group datasets.
const recentCandidates = ref<ReuseCandidate[]>([])
const candidates = ref<ReuseCandidate[]>([])
const recentState = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle')
const candidateState = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle')
const candidatesPartial = ref(false)
const recentPartial = ref(false)
const recentMore = ref<ReuseSearch['loadMore']>()
const candidateMore = ref<ReuseSearch['loadMore']>()
const moreBusy = ref(false)
const picked = ref<ReuseCandidate | null>(null)
const reuseBusy = ref(false)
const { apiBaseUrl, authToken } = useAruna()
let candidateToken = 0
let recentToken = 0
let recentController: AbortController | undefined
let candidateController: AbortController | undefined
let recentTimer: ReturnType<typeof setTimeout> | undefined
let candidateTimer: ReturnType<typeof setTimeout> | undefined

function acceptsCandidate(candidate: ReuseCandidate): boolean {
  return Boolean(candidateType(candidate))
    && (!isAbsoluteUri(candidate.entity.id) || !findEntity(props.draft, candidate.entity.id))
}

watch([() => props.open, () => props.draft.groupId, () => props.draft.documentId, apiBaseUrl, authToken,
  type, query, onlyMatching, () => props.range, () => props.excludeData, () => props.vocab], (values, previous) => {
  recentController?.abort()
  clearTimeout(recentTimer)
  const scopeChanged = !previous || values.slice(0, 5).some((value, i) => value !== previous[i])
  if (scopeChanged) { picked.value = null; recentCandidates.value = [] }
  recentMore.value = undefined
  recentPartial.value = false
  moreBusy.value = false
  const token = ++recentToken
  recentState.value = props.open && !type.value ? 'loading' : 'idle'
  if (!props.open || type.value) return
  const controller = recentController = new AbortController()
  const load = () => findRecentCandidates({ groupId: props.draft.groupId, query: query.value,
    excludeDocumentId: props.draft.documentId, accept: acceptsCandidate, signal: controller.signal })
    .then((result) => {
      if (token !== recentToken) return
      recentCandidates.value = result.candidates
      recentPartial.value = result.partial
      recentMore.value = result.loadMore
      recentState.value = 'ready'
    })
    .catch(() => { if (token === recentToken) recentState.value = 'failed' })
  if (query.value.trim()) recentTimer = setTimeout(() => { void load() }, 250)
  else void load()
}, { immediate: true })

watch([type, () => props.draft.groupId, () => props.draft.documentId, apiBaseUrl, authToken,
  name, () => props.open, onlyMatching, () => props.range, () => props.excludeData, () => props.vocab], (values, previous) => {
  candidateController?.abort()
  clearTimeout(candidateTimer)
  const next = type.value
  if (next && picked.value && !entitiesOfType([picked.value.entity], next).length) unpick()
  if (!previous || values.slice(0, 5).some((value, i) => value !== previous[i])) candidates.value = []
  candidateMore.value = undefined
  candidatesPartial.value = false
  moreBusy.value = false
  candidateState.value = next && props.open ? 'loading' : 'idle'
  const token = ++candidateToken
  if (!next || !props.open) return
  const controller = candidateController = new AbortController()
  const load = () => findCandidates(next, { groupId: props.draft.groupId, query: name.value,
    excludeDocumentId: props.draft.documentId, accept: acceptsCandidate, signal: controller.signal })
    .then((result) => {
      if (token !== candidateToken) return
      candidates.value = result.candidates
      candidatesPartial.value = result.partial
      candidateMore.value = result.loadMore
      candidateState.value = 'ready'
    })
    .catch(() => { if (token === candidateToken) candidateState.value = 'failed' })
  if (name.value.trim() && !picked.value) candidateTimer = setTimeout(() => { void load() }, 250)
  else void load()
})

async function loadMore(typed: boolean) {
  const token = typed ? candidateToken : recentToken
  const next = typed ? candidateMore.value : recentMore.value
  if (!next || moreBusy.value) return
  moreBusy.value = true
  try {
    const result = await next()
    if (token !== (typed ? candidateToken : recentToken)) return
    if (typed) {
      candidates.value.push(...result.candidates)
      candidatesPartial.value ||= result.partial
      candidateMore.value = result.loadMore
    } else {
      recentCandidates.value.push(...result.candidates)
      recentPartial.value ||= result.partial
      recentMore.value = result.loadMore
    }
  } catch {
    if (token === (typed ? candidateToken : recentToken)) {
      if (typed) candidatesPartial.value = true
      else recentPartial.value = true
    }
  } finally {
    if (token === (typed ? candidateToken : recentToken)) moreBusy.value = false
  }
}
onScopeDispose(() => {
  candidateToken += 1
  recentToken += 1
  recentController?.abort()
  candidateController?.abort()
  clearTimeout(recentTimer)
  clearTimeout(candidateTimer)
})

const rangeTypes = computed(() => new Set((props.vocab?.classesInRange(props.range) ?? []).map((term) => term.uri)))

function candidateType(candidate: ReuseCandidate): string {
  if (props.excludeData && isDataEntity(candidate.entity.types)) return ''
  return candidate.entity.types.find((entry) => {
    return !onlyMatching.value || !rangeTypes.value.size || rangeTypes.value.has(vocabTypeUri(entry))
  }) ?? ''
}

const shownRecent = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return recentCandidates.value
    .filter((candidate) => candidateType(candidate))
    .filter((candidate) => !isAbsoluteUri(candidate.entity.id) || !findEntity(props.draft, candidate.entity.id))
    .filter((candidate) => !needle || [displayName(candidate.entity), candidate.entity.id,
      ...(candidate.entity.properties.identifier ?? []).map((value) => value.value),
      ...candidate.entity.types.map(typeLabel), candidate.source.title]
      .some((value) => value.toLowerCase().includes(needle)))

})

const shownCandidates = computed(() => {
  const needle = name.value.trim().toLowerCase()
  const seen = new Set<string>()
  return candidates.value
    .filter((candidate) => !props.excludeData || !isDataEntity(candidate.entity.types))
    .filter((candidate) => entitiesOfType([candidate.entity], type.value).length)
    .filter((candidate) => {
      const key = referenceKey(candidate.reference)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .filter((candidate) => !isAbsoluteUri(candidate.entity.id) || !findEntity(props.draft, candidate.entity.id))
    .filter((candidate) => !needle || [displayName(candidate.entity), candidate.entity.id, candidate.source.title,
      ...candidate.entity.types.map(typeLabel),
      ...(candidate.entity.properties.identifier ?? []).map((value) => value.value)]
      .some((value) => value.toLowerCase().includes(needle)))
    .sort((a, b) => Number(b.source.groupId === props.draft.groupId) - Number(a.source.groupId === props.draft.groupId))

})

function pick(candidate: ReuseCandidate) {
  if (!type.value) type.value = candidateType(candidate)
  picked.value = candidate
  name.value = displayName(candidate.entity)
  identifier.value = candidate.entity.id
  idTouched.value = true
  extra.value = {}
  related.value = []
  hitToken += 1
}

function unpick() {
  picked.value = null
  idTouched.value = false
  refreshId()
}

// An edited identifier no longer names the copied entity.
watch(identifier, (next) => {
  if (picked.value && next !== picked.value.entity.id) picked.value = null
})

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

const typeAbout = computed(() => props.vocab?.class(vocabTypeUri(type.value))?.description ?? '')

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
  hitToken += 1
}, { immediate: true })

function refreshId() {
  identifier.value = autoId(name.value || typeLabel(type.value), props.draft.entities.map((entity) => entity.id))
}

// The identifier follows the name until someone edits it themselves.
watch([name, type], () => {
  if (!idTouched.value) refreshId()
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
  hitToken += 1
  void enrichRelated(hitToken)
}

/** Points every reference at `to` instead of the identifier it was given. */
function retarget(
  properties: Record<string, DraftValue[]>,
  from: string,
  to: string,
): Record<string, DraftValue[]> {
  if (from === to) return properties
  return Object.fromEntries(Object.entries(properties).map(([key, list]) => [
    key,
    list.map((value) => (value.kind === 'reference' && value.value === from ? { ...value, value: to } : value)),
  ]))
}

function stubName(stub: ContextEntity): string {
  return typeof stub.properties.name === 'string' ? stub.properties.name : ''
}

function stubProperties(stub: ContextEntity): Record<string, DraftValue[]> {
  const value = (key: string) => (typeof stub.properties[key] === 'string' ? String(stub.properties[key]) : '')
  return {
    ...(value('url') ? { url: [{ kind: 'url' as const, value: value('url') }] } : {}),
    ...(value('addressCountry') ? { addressCountry: text(value('addressCountry')) } : {}),
  }
}

// An ORCID affiliation carries no ROR. A confident registry match upgrades the
// stub to the real organization; one that arrives after Create changes nothing.
async function enrichRelated(token: number) {
  for (const stub of related.value) {
    if (normalizeRorId(stub.id) || !stubName(stub)) continue
    const match = await matchRorByName(stubName(stub)).catch(() => null)
    if (token !== hitToken) return
    if (!match) continue
    related.value = related.value.map((entity) => (entity.id === stub.id ? match.entity : entity))
    extra.value = retarget(extra.value, stub.id, match.entity.id)
  }
}

// Dropping the registry id gives the entity back its generated identifier.
function forgetHit() {
  extra.value = {}
  related.value = []
  idTouched.value = false
  hitToken += 1
  refreshId()
}

const startsWith = computed(() => defaultProperties(props.vocab, type.value)
  .map((entry) => propertyTerm(props.vocab, entry.key)?.label ?? entry.key))

const canCreate = computed(() => Boolean(type.value && identifier.value.trim()))

// A registry id names one specific record, so it decides against a namesake.
const registryId = computed(() => normalizeOrcidId(identifier.value) ?? normalizeRorId(identifier.value) ?? '')

const reuse = computed(() => {
  if (!type.value) return undefined
  const match = findSimilarEntity(props.draft, type.value, name.value)
  if (!match || match.id === rootId(props.draft)) return undefined
  return registryId.value && registryId.value !== match.id ? undefined : match
})

async function create() {
  if (!canCreate.value || reuseBusy.value) return
  let base = props.draft
  let entity = picked.value ? undefined : reuse.value
  if (picked.value) {
    const candidate = picked.value
    const token = candidateToken
    reuseBusy.value = true
    try {
      const current = await resolveReference(candidate.reference)
      if (token !== candidateToken || !props.open || picked.value !== candidate) return
      if (current.source.groupId !== props.draft.groupId && !current.source.public) throw new Error('The source dataset is no longer public.')
      if (!candidateType(current) || !entitiesOfType([current.entity], type.value).length) throw new Error('The saved entity type changed. Search again.')
      const source = name.value.trim() && name.value.trim() !== displayName(candidate.entity)
        ? { ...current.entity, properties: { ...current.entity.properties, name: text(name.value.trim()) } }
        : current.entity
      const copied = copyEntity(props.draft, source, current.related)
      base = copied.draft
      entity = copied.entity
    } catch (error) {
      if (token === candidateToken) lookupError.value = `Could not reuse this entity: ${errorMessage(error)}`
      return
    } finally {
      reuseBusy.value = false
    }
  }
  if (!entity) {
    let properties: Record<string, DraftValue[]> = { ...defaultRows(props.vocab, type.value), ...extra.value }
    for (const stub of related.value) {
      const types = Array.isArray(stub.type) ? stub.type : [stub.type]
      const known = findSimilarEntity(base, types[0] ?? 'Thing', stubName(stub))
      if (known) {
        properties = retarget(properties, stub.id, known.id)
        continue
      }
      base = addEntity(base, {
        type: types[0] ?? 'Thing',
        id: stub.id,
        name: stubName(stub),
        properties: stubProperties(stub),
      }).draft
    }
    const created = addEntity(base, { type: type.value, name: name.value, id: identifier.value, properties })
    base = created.draft
    entity = created.entity
  }
  const linked = linkAs.value
    ? linkReference(base, rootId(base), linkAs.value, entity.id)
    : base
  emit('created', { draft: linked, entity })
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent v-if="!type" class="max-w-lg gap-0 overflow-hidden p-0">
      <div class="min-w-0 border-b border-border px-4 py-3 pr-10">
        <DialogTitle class="text-sm">Add an entity</DialogTitle>
        <DialogDescription class="mt-0.5 text-xs">
          Reuse an entity from this group or a public dataset, or choose a type.
        </DialogDescription>
      </div>
      <CommandPane v-model="query" placeholder="Search saved entities or types" aria-label="Search entities and types" :busy="recentState === 'loading'">
        <div v-if="recentState === 'failed'" class="px-2.5 py-2 text-xs text-muted-foreground">
          Could not search saved datasets.
        </div>
        <div v-else-if="shownRecent.length">
          <p class="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            From saved datasets
          </p>
          <button
            v-for="candidate in shownRecent"
            :key="referenceKey(candidate.reference)"
            type="button"
            role="option"
            class="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left hover:bg-muted/40 data-[active=true]:bg-muted"
            @click="pick(candidate)"
          >
            <span class="w-full truncate text-sm font-medium text-foreground">{{ displayName(candidate.entity) }}</span>
            <span class="w-full truncate text-[11px] text-muted-foreground">
              {{ typeLabel(candidateType(candidate)) }} · {{ candidate.source.groupId === draft.groupId ? 'This group' : 'Public dataset' }} · {{ candidate.source.title }}
            </span>
          </button>
        </div>
        <p v-if="recentPartial" class="px-2.5 py-1 text-[11px] text-muted-foreground">
          Some datasets could not be searched.
        </p>
        <Button v-if="recentMore" variant="ghost" size="sm" :disabled="moreBusy || recentState === 'loading'" @click="loadMore(false)">{{ moreBusy ? 'Loading…' : 'Load more entities' }}</Button>
        <TypeBrowser
          v-model="type"
          v-model:only-matching="onlyMatching"
          :query="query"
          :vocab="vocab"
          :range="range"
          :exclude-data="excludeData"
          :auto-select="false"
          :profile-types="profileTypes"
        />
      </CommandPane>
    </DialogContent>

    <DialogContent v-else class="max-w-lg gap-0 overflow-hidden p-0">
      <div class="min-w-0 border-b border-border px-4 py-3 pr-10">
        <DialogTitle class="text-sm">
          Add {{ /^[aeiou]/i.test(typeLabel(type)) ? 'an' : 'a' }} {{ typeLabel(type) }}
        </DialogTitle>
        <DialogDescription v-if="typeAbout" class="mt-0.5 break-words text-xs">{{ typeAbout }}</DialogDescription>
      </div>

      <div class="scrollbar-thin max-h-[60vh] min-w-0 space-y-4 overflow-y-auto p-4">
        <div v-if="candidateState !== 'idle'" class="min-w-0">
          <p class="text-xs font-medium text-foreground">Reuse an existing {{ typeLabel(type) }}</p>
          <Spinner v-if="candidateState === 'loading'" label="Searching existing datasets" show-label class="mt-1" />
          <p v-else-if="candidateState === 'failed'" class="mt-1 text-[11px] text-muted-foreground">
            Could not search existing datasets.
          </p>
          <template v-if="candidateState !== 'failed'">
            <ul v-if="shownCandidates.length" class="mt-1 divide-y divide-border rounded-md border border-border">
              <li
                v-for="candidate in shownCandidates"
                :key="referenceKey(candidate.reference)"
                class="flex min-w-0 items-center gap-2 px-2 py-1.5 text-xs"
              >
                <button
                  type="button"
                  class="min-w-0 flex-1 rounded-sm text-left hover:text-primary"
                  :aria-pressed="picked ? referenceKey(picked.reference) === referenceKey(candidate.reference) : false"
                  @click="pick(candidate)"
                >
                  <span class="block truncate font-medium text-foreground">{{ displayName(candidate.entity) }}</span>
                  <span class="block truncate text-[11px] text-muted-foreground">
                    {{ candidate.source.groupId === draft.groupId ? 'This group' : 'Public dataset' }} · {{ candidate.source.title }}
                  </span>
                </button>
              </li>
            </ul>
            <p v-else-if="candidateState === 'ready'" class="mt-1 text-[11px] text-muted-foreground">
              {{ candidatesPartial ? 'Nothing found in the datasets that could be searched.' : `No existing ${typeLabel(type)} found.` }}
            </p>
            <p v-if="shownCandidates.length && candidatesPartial" class="mt-1 text-[11px] text-muted-foreground">
              Not every dataset could be searched.
            </p>
          </template>
          <Button v-if="candidateMore" variant="ghost" size="sm" :disabled="moreBusy || candidateState === 'loading'" @click="loadMore(true)">{{ moreBusy ? 'Loading…' : 'Load more entities' }}</Button>
          <Notice v-if="picked" tone="info" class="mt-2 break-words">
            Loads the current saved {{ displayName(picked.entity) }} from
            {{ picked.source.title }}<template v-if="picked.related.length">
              with {{ picked.related.map(displayName).join(', ') }}</template>.
            <button type="button" class="ml-1 underline" @click="unpick">Start from scratch instead</button>
          </Notice>
        </div>

        <div class="min-w-0">
          <label class="text-xs font-medium text-foreground">Name</label>
          <div v-if="registry" class="mt-1 min-w-0 space-y-2">
            <LookupBox
              v-model="name"
              :kind="registry.kind"
              aria-label="Name"
              :placeholder="`Search ${registry.label} by name or id`"
              @select="useHit"
              @clear="forgetHit"
            />
            <p class="break-words text-[11px] text-muted-foreground">
              Search {{ registry.label }} by name or id, or simply type the name yourself.
            </p>
            <div v-if="typedId" class="flex min-w-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                class="max-w-full"
                aria-label="Import this record"
                :disabled="importing"
                @click="importRecord"
              >
                <Spinner v-if="importing" class="text-current" aria-hidden="true" />
                <span class="min-w-0 truncate" :title="`Use ${registry.label} ${typedId}`">
                  Use {{ registry.label }} {{ typedId }}
                </span>
              </Button>
            </div>
          </div>
          <Input v-else v-model="name" class="mt-1" aria-label="Name" autofocus @keydown.enter="create" />
          <Notice v-if="lookupError" tone="warning" class="break-words">{{ lookupError }}</Notice>
          <Notice v-if="reuse && !picked" tone="info" class="mt-2 break-words">
            Matches {{ displayName(reuse) }} already in this dataset; it will be reused.
          </Notice>
        </div>

        <div class="min-w-0">
          <label class="text-xs font-medium text-foreground">Identifier</label>
          <Input
            :model-value="identifier"
            class="mt-1 font-mono text-xs"
            aria-label="Identifier"
            @update:model-value="(value: string | number) => { identifier = String(value); idTouched = true }"
          />
          <p class="mt-1 break-words text-[11px] text-muted-foreground">{{ idHint(type) }}</p>
          <p v-if="startsWith.length" class="mt-1 break-words text-[11px] text-muted-foreground">
            Starts with: {{ startsWith.join(', ') }}
          </p>
        </div>

        <div v-if="linkedFrom" class="min-w-0 break-words rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Linked from <span class="font-medium text-foreground">{{ linkedFrom.entity }}</span>
          as <span class="font-medium text-foreground">{{ linkedFrom.property }}</span>.
        </div>
        <div v-else-if="offerLink && linkOptions.length" class="min-w-0">
          <label class="text-xs font-medium text-foreground">Link from the dataset as</label>
          <Select
            :model-value="linkAs"
            :options="[{ value: '', label: 'None' }, ...linkOptions]"
            class="mt-1"
            placeholder="None"
            aria-label="Link from the dataset as"
            @update:model-value="(value: string) => (linkAs = value)"
          />
          <p class="mt-1 break-words text-[11px] text-muted-foreground">
            {{ linkAs ? 'The dataset will point at this entity.' : 'Nothing points at this entity until you pick a property.' }}
          </p>
        </div>
      </div>

      <DialogFooter class="min-w-0 border-t border-border px-4 py-3">
        <Button variant="outline" @click="type = ''">Back</Button>
        <Button :disabled="!canCreate || reuseBusy" @click="create">{{ reuseBusy ? 'Loading saved entity' : 'Create' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
