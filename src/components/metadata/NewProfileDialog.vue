<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import { computed, ref, watch } from 'vue'
import { ListChecks, Plus, Trash2 } from 'lucide-vue-next'
import { useAruna } from '@/composables/useAruna'
import type { MetadataProfile, ProfileField, ProfileFieldKind } from '@/data/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', profile: MetadataProfile): void
}>()

const { groups, profiles, createMetadata, saving, currentUser } = useAruna()

interface DraftField {
  id: string
  label: string
  description: string
  kind: ProfileFieldKind
  required: boolean
  example: string
  enumOptions: string
}

const groupId = ref('')
const name = ref('')
const slug = ref('')
const domain = ref('')
const description = ref('')
const isPublic = ref(false)
const fields = ref<DraftField[]>([])
const submitError = ref<string | null>(null)

const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))
const fieldKindOptions = [
  { value: 'text', label: 'Single line' },
  { value: 'longtext', label: 'Long text' },
  { value: 'url', label: 'URL' },
  { value: 'date', label: 'Date' },
  { value: 'keyword-list', label: 'Keyword list' },
  { value: 'person-list', label: 'People list' },
  { value: 'license', label: 'License' },
  { value: 'enum', label: 'One of' },
]

const canSubmit = computed(() => Boolean(currentUser.value && groupId.value && name.value.trim() && slug.value.trim() && fields.value.length))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    groupId.value = groups.value[0]?.id ?? ''
    name.value = ''
    slug.value = ''
    domain.value = 'General'
    description.value = ''
    isPublic.value = false
    submitError.value = null
    fields.value = [
      { id: 'title', label: 'Title', description: 'Concise human-readable title.', kind: 'text', required: true, example: '', enumOptions: '' },
      { id: 'description', label: 'Description', description: 'Plain-language summary.', kind: 'longtext', required: true, example: '', enumOptions: '' },
      { id: 'keywords', label: 'Keywords', description: 'Searchable tags.', kind: 'keyword-list', required: false, example: '', enumOptions: '' },
    ]
  },
  { immediate: true },
)

watch(name, (value) => {
  if (!slug.value) slug.value = slugify(value)
})

function addField() {
  fields.value.push({ id: '', label: '', description: '', kind: 'text', required: false, example: '', enumOptions: '' })
}

function removeField(index: number) {
  fields.value.splice(index, 1)
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function normalizeFieldId(field: DraftField): string {
  return field.id.trim() || slugify(field.label).replace(/-/g, '_')
}

function schemaType(field: DraftField) {
  if (field.kind === 'keyword-list' || field.kind === 'person-list') return { type: 'array', items: { type: 'string' } }
  if (field.kind === 'date') return { type: 'string', format: 'date' }
  if (field.kind === 'url' || field.kind === 'license') return { type: 'string', format: 'uri' }
  if (field.kind === 'enum') return { type: 'string', enum: field.enumOptions.split(',').map((option) => option.trim()).filter(Boolean) }
  return { type: 'string' }
}

function buildValidator() {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const field of fields.value) {
    const id = normalizeFieldId(field)
    if (!id || !field.label.trim()) continue
    properties[id] = {
      title: field.label.trim(),
      description: field.description.trim(),
      examples: field.example.trim() ? [field.example.trim()] : undefined,
      ...schemaType(field),
    }
    if (field.required) required.push(id)
  }
  return {
    '$schema': 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required,
    properties,
  }
}

function buildRoCrate() {
  const profileId = `aruna:profile/${slug.value}`
  return {
    '@context': [
      'https://w3id.org/ro/crate/1.2/context',
      { aruna: 'https://w3id.org/aruna/ns#' },
    ],
    '@graph': [
      {
        '@id': 'ro-crate-metadata.json',
        '@type': 'CreativeWork',
        about: { '@id': profileId },
        conformsTo: { '@id': 'https://w3id.org/ro/crate/1.2' },
      },
      {
        '@id': profileId,
        '@type': ['CreativeWork', 'aruna:MetadataProfile'],
        name: name.value.trim(),
        description: description.value.trim(),
        domain: domain.value.trim(),
        'aruna:validator': { '@id': '#validator' },
      },
      {
        '@id': '#validator',
        '@type': 'File',
        encodingFormat: 'application/schema+json',
        text: buildValidator(),
      },
    ],
  }
}

async function submit() {
  if (!canSubmit.value) return
  submitError.value = null
  try {
    await createMetadata({
      group_id: groupId.value,
      path: `profiles/${slug.value}`,
      public: isPublic.value,
      rocrate: buildRoCrate(),
    })
    const profile = profiles.value.find((item) => item.id === slug.value) ?? {
      id: slug.value,
      name: name.value.trim(),
      shortName: name.value.trim().split(/\s+/)[0] || slug.value,
      description: description.value.trim(),
      domain: domain.value.trim(),
      iconColor: '#335DC6',
      fields: fields.value.map<ProfileField>((field) => ({
        id: normalizeFieldId(field),
        label: field.label.trim(),
        description: field.description.trim(),
        kind: field.kind,
        required: field.required,
        example: field.example.trim() || undefined,
        enumOptions: field.kind === 'enum' ? field.enumOptions.split(',').map((option) => option.trim()).filter(Boolean) : undefined,
      })),
      suggestedKeywords: [],
      managed: isPublic.value,
      usedCount: 0,
    }
    emit('created', profile)
    emit('update:open', false)
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <ListChecks class="h-4 w-4 text-primary" /> New metadata profile
        </DialogTitle>
        <DialogDescription>
          Creates a real RO-Crate metadata document under <code>profiles/</code>.
        </DialogDescription>
      </DialogHeader>

      <div class="max-h-[65vh] space-y-4 overflow-y-auto pr-1 scrollbar-thin">
        <div v-if="!currentUser" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Add a bearer token in Settings before creating profiles.
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="text-xs font-medium text-foreground">Group</label>
            <Select v-model="groupId" :options="groupOptions" class="mt-1" placeholder="Choose a group" />
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Slug</label>
            <Input v-model="slug" class="mt-1" placeholder="genomics" />
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Name</label>
            <Input v-model="name" class="mt-1" placeholder="Genomics" />
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Domain</label>
            <Input v-model="domain" class="mt-1" placeholder="Life sciences" />
          </div>
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Description</label>
          <Textarea v-model="description" class="mt-1" rows="2" />
        </div>
        <label class="flex items-center justify-between rounded-md border border-border p-3 text-sm">
          <span>Public profile<span class="block text-[11px] text-muted-foreground">Public profiles are discoverable without auth.</span></span>
          <Switch :checked="isPublic" @update:checked="(v: boolean) => (isPublic = v)" />
        </label>

        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="text-sm font-semibold text-foreground">Validator fields</h4>
              <p class="text-[11px] text-muted-foreground">Fields are encoded into the profile JSON Schema validator.</p>
            </div>
            <Button type="button" variant="outline" size="sm" @click="addField"><Plus class="h-3.5 w-3.5" /> Add field</Button>
          </div>
          <div v-for="(field, index) in fields" :key="index" class="rounded-lg border border-border bg-muted/20 p-3">
            <div class="grid gap-2 sm:grid-cols-2">
              <Input v-model="field.label" placeholder="Field label" />
              <Select v-model="field.kind" :options="fieldKindOptions" />
              <Input v-model="field.id" placeholder="Field id (optional)" />
              <Input v-model="field.example" placeholder="Example (optional)" />
              <Input v-model="field.description" class="sm:col-span-2" placeholder="Description" />
              <Input v-if="field.kind === 'enum'" v-model="field.enumOptions" placeholder="Comma-separated options" />
              <label class="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                Required <Switch :checked="field.required" @update:checked="(v: boolean) => (field.required = v)" />
              </label>
            </div>
            <div class="mt-2 flex justify-end">
              <button type="button" class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive" @click="removeField(index)">
                <Trash2 class="h-3 w-3" /> remove
              </button>
            </div>
          </div>
        </div>
        <div v-if="submitError" class="text-xs text-destructive">{{ submitError }}</div>
      </div>

      <DialogFooter>
        <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!canSubmit || saving" @click="submit">{{ saving ? 'Creating…' : 'Create profile' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
