<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import LookupBox from '@/components/metadata/LookupBox.vue'
import type { ContextEntity, RootRole } from '@/lib/crate/build'
import type { EntityTemplate } from '@/lib/crate/entityTemplates'
import type { LookupHit } from '@/lib/lookup/types'

const props = defineProps<{
  template: EntityTemplate
  initial?: ContextEntity | null
}>()
const emit = defineEmits<{
  (e: 'save', value: { entity: ContextEntity; relatedEntities: ContextEntity[] }): void
  (e: 'cancel'): void
}>()

const values = reactive<Record<string, unknown>>({})
const role = ref<RootRole>(props.template.roles[0])
const selectedHit = ref<LookupHit | null>(null)
const idTouched = ref(false)

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
  idTouched.value = Boolean(props.initial)
  role.value = props.initial?.roles.find((candidate) => props.template.roles.includes(candidate)) ?? props.template.roles[0]
  if (!props.initial) {
    values.name = ''
    values.id = ''
    return
  }
  values.id = props.initial.id
  for (const [key, value] of Object.entries(props.initial.properties)) values[key] = inputValue(value)
}

watch(() => [props.template, props.initial] as const, reset, { immediate: true })
watch(() => values.name, (name) => {
  if (idTouched.value) return
  values.id = typeof name === 'string' && name.trim()
    ? props.template.create({ name }, role.value).id
    : ''
})

const roleOptions = computed(() => props.template.roles.map((value) => ({
  value,
  label: String(value).replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()),
})))
const lookupKind = computed(() =>
  props.template.id === 'person' ? 'person' : props.template.id === 'organization' ? 'organization' : null,
)
const canSave = computed(() => Boolean(String(values.name ?? '').trim()))

function useLookup(hit: LookupHit) {
  selectedHit.value = hit
  idTouched.value = true
  values.id = hit.entity.id
  for (const [key, value] of Object.entries(hit.entity.properties)) values[key] = inputValue(value)
}

function updateId(value: string | number) {
  idTouched.value = true
  values.id = value
}

function submit() {
  if (!canSave.value) return
  const generated = props.template.create(values, role.value)
  const hit = selectedHit.value
  const entity = hit && hit.entity.id === generated.id
    ? {
        ...generated,
        type: hit.entity.type,
        properties: { ...hit.entity.properties, ...generated.properties },
      }
    : generated
  emit('save', { entity, relatedEntities: hit?.relatedEntities ?? [] })
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <LookupBox
      v-if="lookupKind"
      :kind="lookupKind"
      :placeholder="lookupKind === 'person' ? 'Search ORCID by name or id' : 'Search ROR by organization or id'"
      @select="useLookup"
    />

    <div>
      <label class="text-xs font-medium text-foreground">Role</label>
      <Select v-model="role" :options="roleOptions" class="mt-1" aria-label="Root role" />
    </div>

    <div>
      <label class="text-xs font-medium text-foreground">@id</label>
      <Input
        :model-value="inputValue(values.id)"
        aria-label="Entity id"
        class="mt-1 font-mono text-xs"
        placeholder="#entity-name"
        @update:model-value="updateId"
      />
      <p class="mt-1 text-[11px] text-muted-foreground">Derived from the name and editable.</p>
    </div>

    <div v-for="field in template.fields" :key="field.property">
      <label class="text-xs font-medium text-foreground">
        {{ field.label }}<span v-if="field.required" class="text-destructive"> *</span>
      </label>
      <Input
        :model-value="inputValue(values[field.property])"
        :aria-label="field.label"
        class="mt-1"
        :type="field.kind === 'email' ? 'email' : field.kind === 'url' ? 'url' : field.kind === 'date' ? 'date' : field.kind === 'number' ? 'number' : 'text'"
        @update:model-value="(value: string | number) => (values[field.property] = value)"
      />
    </div>

    <div class="flex justify-end gap-2">
      <Button type="button" variant="outline" @click="emit('cancel')">Back</Button>
      <Button type="submit" :disabled="!canSave">{{ initial ? 'Save entity' : 'Add entity' }}</Button>
    </div>
  </form>
</template>
