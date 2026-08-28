<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Input from '@/components/ui/Input.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import EntityTemplateForm from '@/components/metadata/EntityTemplateForm.vue'
import VocabSuggestions from '@/components/metadata/profile-builder/VocabSuggestions.vue'
import {
  ENTITY_TEMPLATES,
  createOtherEntity,
  defaultFieldsForType,
  templateForRole,
  type EntityTemplate,
} from '@/lib/crate/entityTemplates'
import type { ContextEntity, RootRole } from '@/lib/crate/build'
import { CURATED_ENTITY_TYPES, entityTypeLabel } from '@/lib/profiles/entityTypes'

const props = defineProps<{
  open: boolean
  entities: ContextEntity[]
  datasetEntities?: ContextEntity[]
  editing?: ContextEntity | null
  // Set by a root reference field: the template is preselected and the form
  // writes this role instead of asking for one.
  role?: RootRole | null
}>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save', value: { entity: ContextEntity; relatedEntities: ContextEntity[] }): void
  (e: 'reuse', entity: ContextEntity): void
}>()

const tab = ref('templates')
const selectedTemplateId = ref('')
const otherTypeUri = ref('http://schema.org/Thing')
const typeQuery = ref('')

function typeName(entity: ContextEntity): string {
  const type = Array.isArray(entity.type) ? entity.type[0] : entity.type
  return type.split('/').pop() || type
}

function templateForEntity(entity: ContextEntity | null | undefined): EntityTemplate | undefined {
  if (!entity) return undefined
  return ENTITY_TEMPLATES.find((template) => template.type === typeName(entity))
    ?? ENTITY_TEMPLATES.find((template) => template.id === 'other')
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    tab.value = 'templates'
    typeQuery.value = ''
    selectedTemplateId.value = templateForEntity(props.editing)?.id
      ?? (props.role ? templateForRole(props.role)?.id ?? '' : '')
  },
  { immediate: true },
)

const selectedTemplate = computed(() =>
  ENTITY_TEMPLATES.find((template) => template.id === selectedTemplateId.value),
)

const activeTemplate = computed<EntityTemplate | undefined>(() => {
  const selected = selectedTemplate.value
  if (!selected || selected.id !== 'other') return selected
  const typeUri = otherTypeUri.value
  return {
    ...selected,
    type: entityTypeLabel(typeUri),
    typeUri,
    fields: defaultFieldsForType(typeUri),
    create: (values: Record<string, unknown>, role?: RootRole) =>
      createOtherEntity(typeUri, values, role ?? 'about'),
  }
})

function commit(value: { entity: ContextEntity; relatedEntities: ContextEntity[] }) {
  const duplicate = props.entities.find((entity) =>
    entity.id === value.entity.id && entity.id !== props.editing?.id,
  )
  if (duplicate) {
    const reused = {
      ...duplicate,
      roles: [...new Set([...duplicate.roles, ...value.entity.roles])],
    }
    emit('reuse', reused)
  } else {
    emit('save', value)
  }
  emit('update:open', false)
}

function chooseExisting(entity: ContextEntity) {
  const duplicate = props.entities.find((candidate) => candidate.id === entity.id)
  if (duplicate) emit('reuse', duplicate)
  else emit('save', { entity: { ...entity, properties: { ...entity.properties } }, relatedEntities: [] })
  emit('update:open', false)
}

function entityName(entity: ContextEntity): string {
  return typeof entity.properties.name === 'string' ? entity.properties.name : entity.id
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ editing ? 'Edit entity' : 'Add entity' }}</DialogTitle>
        <DialogDescription>Describe something the dataset refers to, or reuse one from a dataset already loaded in this session.</DialogDescription>
      </DialogHeader>

      <Tabs v-model="tab">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="datasets">From your datasets</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" class="mt-4">
          <div v-if="!activeTemplate" class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="template in ENTITY_TEMPLATES"
              :key="template.id"
              type="button"
              class="rounded-lg border border-border p-3 text-left hover:border-primary/40 hover:bg-primary/5"
              @click="selectedTemplateId = template.id"
            >
              <span class="block text-sm font-medium text-foreground">{{ template.label }}</span>
              <span class="mt-1 block text-xs text-muted-foreground">{{ template.description }}</span>
            </button>
          </div>
          <div v-else class="space-y-4">
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-medium text-foreground">{{ activeTemplate.label }}</p>
              <Button v-if="!editing" variant="ghost" size="sm" @click="selectedTemplateId = ''">Change template</Button>
            </div>
            <div v-if="activeTemplate.id === 'other'">
              <label class="text-xs font-medium text-foreground">Entity type</label>
              <div class="mt-1 flex flex-wrap gap-1.5">
                <button
                  v-for="option in CURATED_ENTITY_TYPES"
                  :key="option.uri"
                  type="button"
                  class="rounded-full border px-2.5 py-1 text-[11px] transition-colors"
                  :class="option.uri === otherTypeUri
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted/40'"
                  @click="otherTypeUri = option.uri"
                >{{ option.label }}</button>
              </div>
              <Input
                v-model="typeQuery"
                class="mt-1.5"
                placeholder="Search for another type"
                aria-label="Search entity types"
              />
              <VocabSuggestions
                :query="typeQuery"
                kind="class"
                :exclude="[otherTypeUri]"
                @pick="(term) => { otherTypeUri = term.uri; typeQuery = '' }"
              />
              <p class="mt-1 text-[11px] text-muted-foreground">
                Using {{ entityTypeLabel(otherTypeUri) }}.
              </p>
            </div>
            <EntityTemplateForm
              :template="activeTemplate"
              :initial="editing"
              :role="role"
              @save="commit"
              @cancel="selectedTemplateId = ''"
            />
          </div>
        </TabsContent>

        <TabsContent value="datasets" class="mt-4 space-y-2">
          <button
            v-for="entity in datasetEntities ?? []"
            :key="entity.id"
            type="button"
            class="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-muted/40"
            @click="chooseExisting(entity)"
          >
            <span class="block text-sm font-medium text-foreground">{{ entityName(entity) }}</span>
            <span class="block truncate font-mono text-[11px] text-muted-foreground">{{ entity.id }}</span>
          </button>
          <p v-if="!(datasetEntities ?? []).length" class="py-6 text-center text-xs text-muted-foreground">
            No reusable entities have been loaded from your datasets yet.
          </p>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
