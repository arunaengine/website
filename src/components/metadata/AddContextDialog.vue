<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Select from '@/components/ui/Select.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import EntityTemplateForm from '@/components/metadata/EntityTemplateForm.vue'
import {
  ENTITY_TEMPLATES,
  createOtherEntity,
  otherEntityTypeOptions,
  propertySuggestionsForType,
  type EntityTemplate,
  type EntityTemplateFieldKind,
} from '@/lib/crate/entityTemplates'
import type { ContextEntity, RootRole } from '@/lib/crate/build'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'

const props = defineProps<{
  open: boolean
  entities: ContextEntity[]
  datasetEntities?: ContextEntity[]
  editing?: ContextEntity | null
}>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save', value: { entity: ContextEntity; relatedEntities: ContextEntity[] }): void
  (e: 'reuse', entity: ContextEntity): void
}>()

const tab = ref('templates')
const selectedTemplateId = ref('')
const otherTypeUri = ref('http://schema.org/Thing')
const otherOptions = ref<Array<{ value: string; label: string }>>([])

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
    selectedTemplateId.value = templateForEntity(props.editing)?.id ?? ''
  },
)

const selectedTemplate = computed(() =>
  ENTITY_TEMPLATES.find((template) => template.id === selectedTemplateId.value),
)

function fieldKind(kind?: string): EntityTemplateFieldKind {
  if (kind === 'url' || kind === 'email' || kind === 'date' || kind === 'number') return kind
  if (kind === 'entity') return 'reference'
  return 'text'
}

const activeTemplate = computed<EntityTemplate | undefined>(() => {
  const selected = selectedTemplate.value
  if (!selected || selected.id !== 'other') return selected
  const typeUri = otherTypeUri.value
  return {
    ...selected,
    type: entityTypeLabel(typeUri),
    typeUri,
    fields: propertySuggestionsForType(typeUri).map((term) => ({
      property: term.name,
      label: term.label,
      kind: fieldKind(term.suggestedKind),
      propertyUri: term.uri,
      required: term.name === 'name' || undefined,
    })),
    create: (values: Record<string, unknown>, role?: RootRole) =>
      createOtherEntity(typeUri, values, role ?? 'about'),
  }
})

async function chooseTemplate(template: EntityTemplate) {
  selectedTemplateId.value = template.id
  if (template.id === 'other' && !otherOptions.value.length) {
    otherOptions.value = (await otherEntityTypeOptions()).map((option) => ({
      value: option.uri,
      label: option.label,
    }))
  }
}

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
        <DialogTitle>{{ editing ? 'Edit context' : 'Add context' }}</DialogTitle>
        <DialogDescription>Add a described entity or reuse one from a dataset already loaded in this session.</DialogDescription>
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
              @click="chooseTemplate(template)"
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
              <Select v-model="otherTypeUri" :options="otherOptions" class="mt-1" aria-label="Other entity type" />
            </div>
            <EntityTemplateForm
              :template="activeTemplate"
              :initial="editing"
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
