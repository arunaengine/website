<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import LookupBox from '@/components/metadata/LookupBox.vue'
import VocabSuggestions from '@/components/metadata/profile-builder/VocabSuggestions.vue'
import { roleLabel, type ContextEntity, type RootRole } from '@/lib/crate/build'
import { applyFields, fieldKindOf, type EntityTemplate, type EntityTemplateField } from '@/lib/crate/entityTemplates'
import { termNameFromUri } from '@/lib/profiles/uri'
import type { VocabTerm } from '@/lib/profiles/vocabulary'
import type { LookupHit } from '@/lib/lookup/types'
import { Plus, X } from '@lucide/vue'

const SCHEMA = 'http://schema.org/'

const props = defineProps<{
  template: EntityTemplate
  initial?: ContextEntity | null
  // Fixed by the root reference field that opened the dialog; hides the chooser.
  role?: RootRole | null
}>()
const emit = defineEmits<{
  (e: 'save', value: { entity: ContextEntity; relatedEntities: ContextEntity[] }): void
  (e: 'cancel'): void
}>()

const values = reactive<Record<string, unknown>>({})
const chosenRole = ref<RootRole>(props.template.roles[0])
const selectedHit = ref<LookupHit | null>(null)
const idTouched = ref(false)
const manualOpen = ref(false)
const extraFields = ref<EntityTemplateField[]>([])
const addingProperty = ref(false)
const propertyQuery = ref('')

function inputValue(value: unknown): string | number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const id = (value as Record<string, unknown>)['@id']
    if (typeof id === 'string') return id
  }
  return ''
}

function reset() {
  for (const key of Object.keys(values)) delete values[key]
  selectedHit.value = null
  addingProperty.value = false
  propertyQuery.value = ''
  extraFields.value = []
  idTouched.value = Boolean(props.initial)
  manualOpen.value = Boolean(props.initial)
  chosenRole.value = props.initial?.roles.find((candidate) => props.template.roles.includes(candidate))
    ?? props.template.roles[0]
  if (!props.initial) {
    values.name = ''
    values.id = ''
    return
  }
  values.id = props.initial.id
  const known = new Set(props.template.fields.map((field) => field.property))
  for (const [key, value] of Object.entries(props.initial.properties)) {
    values[key] = inputValue(value)
    // Keeps a property the template does not know about editable and saved.
    if (!known.has(key)) extraFields.value.push({ property: key, label: key, kind: 'text', propertyUri: `${SCHEMA}${key}` })
  }
}

watch(() => [props.template, props.initial] as const, reset, { immediate: true })
watch(() => values.name, (name) => {
  if (idTouched.value) return
  values.id = typeof name === 'string' && name.trim()
    ? props.template.create({ name }, activeRole.value).id
    : ''
})

const activeRole = computed<RootRole>(() => props.role ?? chosenRole.value)
const fields = computed(() => [...props.template.fields, ...extraFields.value])
const shownUris = computed(() => fields.value.map((field) => field.propertyUri))
const roleOptions = computed(() => props.template.roles.map((value) => ({ value, label: roleLabel(String(value)) })))
const lookupKind = computed(() =>
  props.template.id === 'person' ? 'person' : props.template.id === 'organization' ? 'organization' : null,
)
const showFields = computed(() => !lookupKind.value || manualOpen.value)
const canSave = computed(() => Boolean(String(values.name ?? '').trim()))

function useLookup(hit: LookupHit) {
  selectedHit.value = hit
  idTouched.value = true
  manualOpen.value = true
  values.id = hit.entity.id
  for (const [key, value] of Object.entries(hit.entity.properties)) values[key] = inputValue(value)
}

function updateId(value: string | number) {
  idTouched.value = true
  values.id = value
}

function addField(field: EntityTemplateField) {
  if (!fields.value.some((candidate) => candidate.property === field.property)) {
    extraFields.value = [...extraFields.value, field]
  }
  propertyQuery.value = ''
  addingProperty.value = false
}

function addTerm(term: VocabTerm) {
  const property = term.name || termNameFromUri(term.uri)
  addField({ property, label: term.label || property, kind: fieldKindOf(term.kind), propertyUri: term.uri })
}

function addTypedProperty() {
  const property = propertyQuery.value.trim()
  if (property) addField({ property, label: property, kind: 'text', propertyUri: `${SCHEMA}${property}` })
}

function removeField(property: string) {
  extraFields.value = extraFields.value.filter((field) => field.property !== property)
  delete values[property]
}

function inputType(field: EntityTemplateField): string {
  if (field.kind === 'email' || field.kind === 'url' || field.kind === 'date' || field.kind === 'number') return field.kind
  return 'text'
}

function submit() {
  if (!canSave.value) return
  const generated = applyFields(props.template.create(values, activeRole.value), extraFields.value, values)
  const withRole = props.role ? { ...generated, roles: [props.role] } : generated
  const hit = selectedHit.value
  const entity = hit && hit.entity.id === withRole.id
    ? {
        ...withRole,
        type: hit.entity.type,
        properties: { ...hit.entity.properties, ...withRole.properties },
      }
    : withRole
  emit('save', { entity, relatedEntities: hit?.relatedEntities ?? [] })
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <div v-if="lookupKind" class="space-y-2">
      <LookupBox
        :kind="lookupKind"
        :placeholder="lookupKind === 'person' ? 'Search ORCID by name or id' : 'Search ROR by organization or id'"
        @select="useLookup"
      />
      <Button v-if="!manualOpen" type="button" variant="link" size="sm" class="h-auto p-0 text-xs" @click="manualOpen = true">
        Enter details manually
      </Button>
    </div>

    <template v-if="showFields">
      <div v-if="!role">
        <label class="text-xs font-medium text-foreground">Role</label>
        <Select v-model="chosenRole" :options="roleOptions" class="mt-1" aria-label="Root role" />
      </div>

      <div>
        <label class="text-xs font-medium text-foreground">Identifier</label>
        <Input
          :model-value="inputValue(values.id)"
          aria-label="Entity id"
          class="mt-1 font-mono text-xs"
          placeholder="#entity-name"
          @update:model-value="updateId"
        />
        <p class="mt-1 text-[11px] text-muted-foreground">Generated from the name; you can change it.</p>
      </div>

      <div v-for="field in fields" :key="field.property">
        <div class="flex items-center justify-between gap-2">
          <label class="text-xs font-medium text-foreground">
            {{ field.label }}<span v-if="field.required" class="text-destructive"> *</span>
          </label>
          <button
            v-if="extraFields.some((extra) => extra.property === field.property)"
            type="button"
            class="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            :aria-label="`Remove ${field.label}`"
            @click="removeField(field.property)"
          >
            <X class="h-3 w-3" />
          </button>
        </div>
        <Input
          :model-value="inputValue(values[field.property])"
          :aria-label="field.label"
          class="mt-1"
          :type="inputType(field)"
          @update:model-value="(value: string | number) => (values[field.property] = value)"
        />
      </div>

      <div>
        <Button
          v-if="!addingProperty"
          type="button"
          variant="link"
          size="sm"
          class="h-auto p-0 text-xs"
          @click="addingProperty = true"
        >
          <Plus class="h-3.5 w-3.5" /> Add property
        </Button>
        <div v-else class="space-y-1.5">
          <Input
            v-model="propertyQuery"
            placeholder="Search properties"
            aria-label="Search properties"
            @keydown.enter.prevent="addTypedProperty"
          />
          <VocabSuggestions :query="propertyQuery" kind="property" :exclude="shownUris" @pick="addTerm" />
          <div class="flex items-center gap-2">
            <Button v-if="propertyQuery.trim()" type="button" variant="outline" size="sm" @click="addTypedProperty">
              Use {{ propertyQuery.trim() }}
            </Button>
            <Button type="button" variant="ghost" size="sm" @click="addingProperty = false">Cancel</Button>
          </div>
        </div>
      </div>
    </template>

    <div class="flex justify-end gap-2">
      <Button type="button" variant="outline" @click="emit('cancel')">Back</Button>
      <Button type="submit" :disabled="!canSave">{{ initial ? 'Save entity' : 'Add entity' }}</Button>
    </div>
  </form>
</template>
