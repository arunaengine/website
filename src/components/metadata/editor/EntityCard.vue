<script setup lang="ts">
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import SelectDataDialog from '@/components/data/SelectDataDialog.vue'
import SubcratePickerDialog from '@/components/metadata/SubcratePickerDialog.vue'
import PropertyEditor from './PropertyEditor.vue'
import AddPropertyPopover from './AddPropertyPopover.vue'
import TypeBrowser from './TypeBrowser.vue'
import { useAruna } from '@/composables/useAruna'
import { takeSelectedContentReference } from '@/lib/contentIdentity'
import { isAbsoluteUri } from '@/lib/profiles/uri'
import type { MetadataDocumentListItem } from '@/lib/api'
import {
  addFilePart,
  addSubcratePart,
  addValue,
  defaultValue,
  displayName,
  entityGroup,
  findEntity,
  removeEntity,
  setTypes,
  typeLabel,
  type CrateDraft,
  type DraftEntity,
  type DraftValueKind,
} from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { ChevronDown, ChevronRight, Database, ExternalLink, FileJson2, Plus, Trash2, X } from '@lucide/vue'

const props = defineProps<{
  draft: CrateDraft
  entity: DraftEntity
  vocab: VocabIndex | null
}>()
const emit = defineEmits<{
  (e: 'update', draft: CrateDraft): void
  (e: 'jump', entityId: string): void
}>()

const { apiBaseUrl } = useAruna()

const collapsed = ref(false)
const propertyOpen = ref(false)
const typeOpen = ref(false)
const pickerType = ref('')
const objectsOpen = ref(false)
const datasetsOpen = ref(false)
const externalOpen = ref(false)
const externalUrl = ref('')
const externalName = ref('')
const confirmRemove = ref(false)

const group = computed(() => entityGroup(props.draft, props.entity))
const isRoot = computed(() => group.value === 'root')
const badge = computed(() => {
  if (isRoot.value) return 'This dataset'
  return group.value === 'data' ? props.entity.types.map(typeLabel).join(', ') : 'Contextual'
})
const parts = computed(() => (props.entity.properties.hasPart ?? [])
  .map((value) => ({ id: value.value, entity: findEntity(props.draft, value.value) })))
const impact = computed(() => props.draft.entities.filter((candidate) =>
  Object.values(candidate.properties).some((list) =>
    list.some((value) => value.kind === 'reference' && value.value === props.entity.id))).length)

function addProperty(picked: { key: string; kind: DraftValueKind }) {
  propertyOpen.value = false
  emit('update', addValue(props.draft, props.entity.id, picked.key, defaultValue(picked.kind)))
}

function addType(type: string) {
  typeOpen.value = false
  pickerType.value = ''
  emit('update', setTypes(props.draft, props.entity.id, [...props.entity.types, type]))
}

function removeType(type: string) {
  emit('update', setTypes(props.draft, props.entity.id, props.entity.types.filter((candidate) => candidate !== type)))
}

function remove() {
  confirmRemove.value = false
  emit('update', removeEntity(props.draft, props.entity.id).draft)
}

function addObject(entry: { label: string; url: string }) {
  const selected = takeSelectedContentReference(entry.url)
  emit('update', addFilePart(props.draft, {
    id: entry.url,
    name: entry.label || entry.url,
    ...(selected?.contentUrl ? { contentUrl: selected.contentUrl } : {}),
  }))
}

function addExternal() {
  const url = externalUrl.value.trim()
  if (!isAbsoluteUri(url)) return
  emit('update', addFilePart(props.draft, { id: url, name: externalName.value.trim() || url }))
  externalUrl.value = ''
  externalName.value = ''
  externalOpen.value = false
}

function addDatasets(items: MetadataDocumentListItem[]) {
  let next = props.draft
  for (const item of items) {
    if (!item.graph_iri) continue
    next = addSubcratePart(next, {
      iri: item.graph_iri,
      name: item.document_path,
      identifier: item.document_id,
      subjectOf: `${apiBaseUrl.value.replace(/\/+$/, '')}/metadata/${encodeURIComponent(item.document_id)}/rocrate`,
    })
  }
  datasetsOpen.value = false
  emit('update', next)
}

// Ctrl/Cmd+E opens the property picker while the card has focus.
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'e' || !(event.ctrlKey || event.metaKey)) return
  event.preventDefault()
  propertyOpen.value = true
}
</script>

<template>
  <section :id="`entity-${entity.id}`" class="surface scroll-mt-24" @keydown="onKeydown">
    <header class="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <Badge :variant="isRoot ? 'default' : group === 'data' ? 'sky' : 'secondary'">{{ badge }}</Badge>
          <h3 class="truncate font-display text-sm font-semibold text-aruna-navy">{{ displayName(entity) }}</h3>
        </div>
        <p class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" :title="entity.id">{{ entity.id }}</p>
        <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            v-for="type in entity.types"
            :key="type"
            class="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground/70"
          >
            {{ typeLabel(type) }}
            <button
              v-if="entity.types.length > 1"
              type="button"
              :aria-label="`Remove the type ${typeLabel(type)}`"
              class="text-muted-foreground hover:text-destructive"
              @click="removeType(type)"
            >
              <X class="h-3 w-3" />
            </button>
          </span>
          <div class="relative">
            <Button variant="link" size="sm" class="h-auto p-0 text-[11px]" @click="typeOpen = !typeOpen">
              <Plus class="h-3 w-3" /> Add type
            </Button>
            <div v-if="typeOpen" class="absolute left-0 top-full z-30 mt-1 w-80 rounded-md border border-border bg-popover p-2 shadow-md">
              <TypeBrowser v-model="pickerType" :vocab="vocab" />
              <div class="mt-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" @click="typeOpen = false">Cancel</Button>
                <Button size="sm" aria-label="Add this type" :disabled="!pickerType" @click="addType(pickerType)">Add</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" :aria-label="collapsed ? 'Expand' : 'Collapse'" @click="collapsed = !collapsed">
          <ChevronRight v-if="collapsed" class="h-4 w-4" />
          <ChevronDown v-else class="h-4 w-4" />
        </Button>
        <Button
          v-if="!isRoot"
          variant="ghost"
          size="icon-sm"
          :aria-label="`Remove ${displayName(entity)}`"
          @click="impact ? (confirmRemove = true) : remove()"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>

    <div v-if="!collapsed">
      <Notice v-if="confirmRemove" tone="warning" class="mx-5 mt-3">
        Removing this also drops {{ impact === 1 ? '1 reference' : `${impact} references` }} to it.
        <span class="mt-1 flex gap-2">
          <Button variant="outline" size="sm" @click="confirmRemove = false">Keep it</Button>
          <Button variant="destructive" size="sm" @click="remove">Remove anyway</Button>
        </span>
      </Notice>

      <PropertyEditor
        :draft="draft"
        :entity="entity"
        :vocab="vocab"
        :skip="isRoot ? ['hasPart'] : []"
        @update="(next) => emit('update', next)"
        @jump="(id) => emit('jump', id)"
      />

      <div v-if="isRoot" class="border-t border-border px-5 py-3.5">
        <p class="text-sm font-medium text-foreground">Parts</p>
        <ul v-if="parts.length" class="mt-2 divide-y divide-border rounded-md border border-border">
          <li v-for="part in parts" :key="part.id" class="flex items-center gap-2 px-3 py-2">
            <span class="min-w-0 flex-1 truncate text-xs text-foreground">{{ part.entity ? displayName(part.entity) : part.id }}</span>
            <Badge variant="outline" size="sm">{{ part.entity?.types.map(typeLabel).join(', ') || 'Missing' }}</Badge>
            <Button variant="ghost" size="sm" @click="emit('jump', part.id)">Open</Button>
          </li>
        </ul>
        <p v-else class="mt-2 text-xs text-muted-foreground">No files or datasets are part of this yet.</p>
        <div class="mt-2 flex flex-wrap items-center gap-3">
          <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="objectsOpen = true">
            <Database class="h-3.5 w-3.5" /> Add object
          </Button>
          <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="externalOpen = !externalOpen">
            <ExternalLink class="h-3.5 w-3.5" /> External URL
          </Button>
          <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="datasetsOpen = true">
            <FileJson2 class="h-3.5 w-3.5" /> Existing dataset
          </Button>
        </div>
        <div v-if="externalOpen" class="mt-2 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
          <Input v-model="externalName" placeholder="Label" aria-label="Part label" />
          <Input v-model="externalUrl" placeholder="https://example.org/data.csv" aria-label="Part URL" @keydown.enter="addExternal" />
          <Button size="sm" :disabled="!isAbsoluteUri(externalUrl.trim())" @click="addExternal">Add</Button>
        </div>
      </div>

      <div class="relative border-t border-border px-5 py-3">
        <Button variant="outline" size="sm" @click="propertyOpen = !propertyOpen">
          <Plus class="h-3.5 w-3.5" /> Add property
        </Button>
        <AddPropertyPopover
          v-if="propertyOpen"
          :entity="entity"
          :vocab="vocab"
          class="left-5"
          @pick="addProperty"
          @close="propertyOpen = false"
        />
      </div>
    </div>

    <SelectDataDialog v-if="isRoot" v-model:open="objectsOpen" @add="addObject" />
    <SubcratePickerDialog
      v-if="isRoot"
      v-model:open="datasetsOpen"
      :excluded-iris="parts.map((part) => part.id)"
      @select="addDatasets"
    />
  </section>
</template>
