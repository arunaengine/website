<script setup lang="ts">
import { computed, ref } from 'vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Textarea from '@/components/ui/Textarea.vue'
import PropertyEditor from './PropertyEditor.vue'
import PropertyRow from './PropertyRow.vue'
import IssueMark from './IssueMark.vue'
import { ROW_ACTIONS, ROW_GRID, ROW_LABEL } from './grid'
import {
  addValue,
  findEntity,
  PROMOTED_TYPES,
  removeValue,
  ROOT_FORM_PROPERTIES,
  rootId,
  setProperty,
  type CrateDraft,
  type DraftValueKind,
  type LiveIssue,
} from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { X } from '@lucide/vue'

// The dataset's own form: the fields every dataset has, followed by whatever
// else the root carries as rows.
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

const keywordDraft = ref('')

const root = computed(() => findEntity(props.draft, rootId(props.draft)))
const id = computed(() => rootId(props.draft))
const keywords = computed(() => root.value?.properties.keywords ?? [])

function valueOf(property: string): string {
  return root.value?.properties[property]?.[0]?.value ?? ''
}

function issuesFor(property: string): LiveIssue[] {
  return props.issues.filter((issue) => issue.entityId === id.value && issue.property === property)
}

function setText(property: string, value: string, kind: DraftValueKind = 'text') {
  emit('update', setProperty(props.draft, id.value, property, value.trim() ? [{ kind, value }] : []))
}

function addKeyword() {
  const value = keywordDraft.value.trim()
  if (!value) return
  keywordDraft.value = ''
  emit('update', addValue(props.draft, id.value, 'keywords', { kind: 'text', value }))
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

      <PropertyRow
        v-if="root"
        :draft="draft"
        :entity="root"
        property="license"
        :vocab="vocab"
        :issues="issuesFor('license')"
        always
        :promote-to="PROMOTED_TYPES.license"
        @update="(next) => emit('update', next)"
        @select="(entityId) => emit('select', entityId)"
      />

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

      <div :class="ROW_GRID">
        <span :class="ROW_LABEL">Profile</span>
        <div class="min-w-0">
          <Select
            :model-value="profileId"
            :options="[{ value: '', label: 'No profile' }, ...profiles]"
            placeholder="No profile"
            aria-label="Profile"
            @update:model-value="(value: string) => emit('profile', value)"
          />
          <p class="mt-1 text-[11px] text-muted-foreground">
            A profile pre-fills what it asks for and checks the draft against it. Nothing is locked,
            and "No profile" removes it again. Only public profiles can be assigned to a dataset, so
            private drafts are not listed.
          </p>
        </div>
        <div :class="ROW_ACTIONS"><IssueMark :issues="issuesFor('conformsTo')" /></div>
      </div>
    </div>

    <div class="border-t border-border">
      <p class="px-5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        More properties
      </p>
      <PropertyEditor
        v-if="root"
        :draft="draft"
        :entity="root"
        :vocab="vocab"
        :skip="ROOT_FORM_PROPERTIES"
        :issues="issues"
        @update="(next) => emit('update', next)"
        @select="(entityId) => emit('select', entityId)"
      />
    </div>
  </div>
</template>
