<script setup lang="ts">
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Textarea from '@/components/ui/Textarea.vue'
import PropertyEditor from './PropertyEditor.vue'
import IssueMark from './IssueMark.vue'
import { ROW_ACTIONS, ROW_GRID, ROW_LABEL } from './grid'
import {
  addValue,
  displayName,
  findEntity,
  LICENSE_PRESETS,
  promoteField,
  removeValue,
  ROOT_FORM_PROPERTIES,
  rootId,
  setProperty,
  type CrateDraft,
  type DraftValueKind,
  type LiveIssue,
  type PromotableProperty,
} from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { ArrowRight, Sparkles, X } from '@lucide/vue'

const props = defineProps<{
  draft: CrateDraft
  vocab: VocabIndex | null
  issues: LiveIssue[]
  profiles: Array<{ value: string; label: string }>
  profileId: string
}>()
const emit = defineEmits<{
  (e: 'update', draft: CrateDraft): void
  (e: 'select', entityId: string): void
  (e: 'profile', profileId: string): void
}>()

const OTHER_LICENSE = 'other'
const keywordDraft = ref('')
const otherLicense = ref(false)

const root = computed(() => findEntity(props.draft, rootId(props.draft)))
const id = computed(() => rootId(props.draft))

function valueOf(property: string): string {
  return root.value?.properties[property]?.[0]?.value ?? ''
}

function referenceOf(property: string): string {
  const value = root.value?.properties[property]?.[0]
  return value?.kind === 'reference' ? value.value : ''
}

function issuesFor(property: string): LiveIssue[] {
  return props.issues.filter((issue) => issue.entityId === id.value && issue.property === property)
}

function setText(property: string, value: string, kind: DraftValueKind = 'text') {
  const trimmed = String(value)
  emit('update', setProperty(props.draft, id.value, property, trimmed.trim() ? [{ kind, value: trimmed }] : []))
}

const keywords = computed(() => root.value?.properties.keywords ?? [])

function addKeyword() {
  const value = keywordDraft.value.trim()
  if (!value) return
  keywordDraft.value = ''
  emit('update', addValue(props.draft, id.value, 'keywords', { kind: 'text', value }))
}

const licenseChoice = computed(() => {
  const value = valueOf('license')
  if (referenceOf('license')) return ''
  const preset = LICENSE_PRESETS.find((option) => option.value === value)
  if (preset) return preset.value
  return (value || otherLicense.value) ? OTHER_LICENSE : ''
})

const licenseOptions = computed(() => [
  ...LICENSE_PRESETS.map((option) => ({ value: option.value, label: option.label })),
  { value: OTHER_LICENSE, label: 'Other' },
])

function pickLicense(choice: string) {
  otherLicense.value = choice === OTHER_LICENSE
  if (choice === OTHER_LICENSE) return
  setText('license', choice, 'url')
}

// Promoting keeps what was typed: the value becomes a linked entity of the
// type that fits, and the field then shows that entity instead.
function promote(property: PromotableProperty) {
  const promoted = promoteField(props.draft, property)
  emit('update', promoted.draft)
  emit('select', promoted.entity.id)
}

function unlink(property: string) {
  emit('update', removeValue(props.draft, id.value, property, 0))
}

const PROMOTABLE: Array<{ property: PromotableProperty; label: string; placeholder: string }> = [
  { property: 'publisher', label: 'Publisher', placeholder: 'Who published this' },
  { property: 'contactPoint', label: 'Contact', placeholder: 'team@example.org' },
  { property: 'funder', label: 'Funder', placeholder: 'Who paid for this work' },
]

function linked(property: string) {
  return findEntity(props.draft, referenceOf(property))
}
</script>

<template>
  <div>
    <div class="divide-y divide-border">
      <div :class="ROW_GRID">
        <label :class="ROW_LABEL" for="root-name">Name</label>
        <div class="min-w-0">
          <Input
            id="root-name"
            :model-value="valueOf('name')"
            aria-label="Dataset name"
            placeholder="What this dataset is called"
            @update:model-value="(value: string | number) => setText('name', String(value))"
          />
        </div>
        <div :class="ROW_ACTIONS"><IssueMark :issues="issuesFor('name')" /></div>
      </div>

      <div :class="ROW_GRID">
        <label :class="ROW_LABEL" for="root-description">Description</label>
        <div class="min-w-0">
          <Textarea
            id="root-description"
            :model-value="valueOf('description')"
            rows="3"
            class="font-sans"
            aria-label="Dataset description"
            placeholder="What it contains and how it was made"
            @update:model-value="(value: string) => setText('description', value, 'longtext')"
          />
        </div>
        <div :class="ROW_ACTIONS"><IssueMark :issues="issuesFor('description')" /></div>
      </div>

      <div :class="ROW_GRID">
        <label :class="ROW_LABEL" for="root-date">Date published</label>
        <div class="min-w-0">
          <Input
            id="root-date"
            type="date"
            :model-value="valueOf('datePublished')"
            aria-label="Date published"
            @update:model-value="(value: string | number) => setText('datePublished', String(value), 'date')"
          />
        </div>
        <div :class="ROW_ACTIONS"><IssueMark :issues="issuesFor('datePublished')" /></div>
      </div>

      <div :class="ROW_GRID">
        <span :class="ROW_LABEL">License</span>
        <div class="min-w-0 space-y-2">
          <div v-if="linked('license')" class="flex h-9 items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5">
            <span class="min-w-0 flex-1 truncate text-sm">{{ displayName(linked('license')) }}</span>
            <Badge variant="secondary" size="sm">CreativeWork</Badge>
            <Button variant="ghost" size="icon-sm" aria-label="Open the license entity" @click="emit('select', referenceOf('license'))">
              <ArrowRight class="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Unlink the license" @click="unlink('license')">
              <X class="h-3.5 w-3.5" />
            </Button>
          </div>
          <template v-else>
            <Select
              :model-value="licenseChoice"
              :options="licenseOptions"
              placeholder="Choose a license"
              aria-label="License"
              @update:model-value="pickLicense"
            />
            <Input
              v-if="licenseChoice === OTHER_LICENSE"
              :model-value="valueOf('license')"
              aria-label="License URL"
              placeholder="https://example.org/license"
              @update:model-value="(value: string | number) => setText('license', String(value), 'url')"
            />
            <Button
              variant="link"
              size="sm"
              class="h-8 p-0 text-xs"
              aria-label="More details for License"
              @click="promote('license')"
            >
              <Sparkles class="h-3.5 w-3.5" /> More details
            </Button>
          </template>
        </div>
        <div :class="ROW_ACTIONS"><IssueMark :issues="issuesFor('license')" /></div>
      </div>

      <div :class="ROW_GRID">
        <label :class="ROW_LABEL" for="root-keywords">Keywords</label>
        <div class="min-w-0 space-y-2">
          <div v-if="keywords.length" class="flex flex-wrap gap-1.5">
            <span v-for="(keyword, index) in keywords" :key="index" class="chip h-6">
              {{ keyword.value }}
              <button
                type="button"
                :aria-label="`Remove the keyword ${keyword.value}`"
                class="text-muted-foreground hover:text-destructive"
                @click="emit('update', removeValue(draft, id, 'keywords', index))"
              >
                <X class="h-3 w-3" />
              </button>
            </span>
          </div>
          <Input
            id="root-keywords"
            v-model="keywordDraft"
            aria-label="Add a keyword"
            placeholder="Type a keyword and press Enter"
            @keydown.enter="addKeyword"
          />
        </div>
        <div :class="ROW_ACTIONS"><IssueMark :issues="issuesFor('keywords')" /></div>
      </div>

      <div v-for="field in PROMOTABLE" :key="field.property" :class="ROW_GRID">
        <span :class="ROW_LABEL">{{ field.label }}</span>
        <div class="min-w-0 space-y-2">
          <div v-if="linked(field.property)" class="flex h-9 items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5">
            <span class="min-w-0 flex-1 truncate text-sm">{{ displayName(linked(field.property)) }}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="`Open the ${field.label.toLowerCase()} entity`"
              @click="emit('select', referenceOf(field.property))"
            >
              <ArrowRight class="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="`Unlink the ${field.label.toLowerCase()}`"
              @click="unlink(field.property)"
            >
              <X class="h-3.5 w-3.5" />
            </Button>
          </div>
          <template v-else>
            <Input
              :model-value="valueOf(field.property)"
              :aria-label="field.label"
              :placeholder="field.placeholder"
              @update:model-value="(value: string | number) => setText(field.property, String(value))"
            />
            <Button
              variant="link"
              size="sm"
              class="h-8 p-0 text-xs"
              :aria-label="`More details for ${field.label}`"
              @click="promote(field.property)"
            >
              <Sparkles class="h-3.5 w-3.5" /> More details
            </Button>
          </template>
        </div>
        <div :class="ROW_ACTIONS"><IssueMark :issues="issuesFor(field.property)" /></div>
      </div>

      <div :class="ROW_GRID">
        <span :class="ROW_LABEL">Profile</span>
        <div class="min-w-0">
          <Select
            :model-value="profileId"
            :options="profiles"
            placeholder="No profile"
            aria-label="Profile"
            @update:model-value="(value: string) => emit('profile', value)"
          />
          <p class="mt-1 text-[11px] text-muted-foreground">
            A profile pre-fills what it asks for and checks the draft against it. Nothing is locked.
          </p>
        </div>
        <div :class="ROW_ACTIONS"><IssueMark :issues="issuesFor('conformsTo')" /></div>
      </div>
    </div>

    <div class="border-t border-border">
      <p class="px-5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Everything else
      </p>
      <PropertyEditor
        v-if="root"
        :draft="draft"
        :entity="root"
        :vocab="vocab"
        :skip="ROOT_FORM_PROPERTIES"
        :locked="['hasPart']"
        :issues="issues"
        @update="(next) => emit('update', next)"
        @select="(entityId) => emit('select', entityId)"
      />
    </div>
  </div>
</template>
