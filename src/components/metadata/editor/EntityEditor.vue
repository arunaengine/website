<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import RootForm from './RootForm.vue'
import EntityHeader from './EntityHeader.vue'
import PropertyEditor from './PropertyEditor.vue'
import AddPropertyPopover from './AddPropertyPopover.vue'
import {
  addValue,
  defaultValue,
  findEntity,
  rootId,
  toRoCrate,
  type CrateDraft,
  type DraftValueKind,
  type LiveIssue,
} from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { Plus } from '@lucide/vue'

const ROOT_VIEW_KEY = 'aruna.dataset.rootView'

const props = defineProps<{
  draft: CrateDraft
  selected: string
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

const propertyOpen = ref(false)
const rootView = ref<'form' | 'properties'>('form')

const entity = computed(() => findEntity(props.draft, props.selected))
const isRoot = computed(() => props.selected === rootId(props.draft))
const asRows = computed(() => !isRoot.value || rootView.value === 'properties')
const json = computed(() => JSON.stringify(toRoCrate(props.draft), null, 2))

onMounted(() => {
  try {
    const stored = globalThis.localStorage?.getItem(ROOT_VIEW_KEY)
    if (stored === 'properties' || stored === 'form') rootView.value = stored
  } catch {
    rootView.value = 'form'
  }
})

function pickView(view: 'form' | 'properties') {
  rootView.value = view
  try {
    globalThis.localStorage?.setItem(ROOT_VIEW_KEY, view)
  } catch {
    // A browser without writable storage simply forgets the choice.
  }
}

function addProperty(picked: { key: string; kind: DraftValueKind }) {
  propertyOpen.value = false
  if (!entity.value) return
  emit('update', addValue(props.draft, entity.value.id, picked.key, defaultValue(picked.kind)))
}
</script>

<template>
  <section v-if="entity" class="surface">
    <EntityHeader
      :draft="draft"
      :entity="entity"
      :vocab="vocab"
      @update="(next) => emit('update', next)"
      @select="(id) => emit('select', id)"
    >
      <template v-if="isRoot" #view>
        <div class="inline-flex items-center rounded-md border border-border p-0.5">
          <button
            v-for="view in (['form', 'properties'] as const)"
            :key="view"
            type="button"
            class="rounded-[3px] px-2.5 py-1 text-xs font-medium capitalize"
            :class="rootView === view ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground'"
            :aria-pressed="rootView === view"
            @click="pickView(view)"
          >
            {{ view === 'form' ? 'Form' : 'Properties' }}
          </button>
        </div>
      </template>
    </EntityHeader>

    <RootForm
      v-if="isRoot && !asRows"
      :draft="draft"
      :vocab="vocab"
      :issues="issues"
      :profiles="profiles"
      :profile-id="profileId"
      @update="(next) => emit('update', next)"
      @select="(id) => emit('select', id)"
      @profile="(id) => emit('profile', id)"
    />
    <PropertyEditor
      v-else
      :draft="draft"
      :entity="entity"
      :vocab="vocab"
      :locked="isRoot ? ['hasPart'] : []"
      :issues="issues"
      @update="(next) => emit('update', next)"
      @select="(id) => emit('select', id)"
    />

    <div class="relative flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
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

    <details v-if="isRoot && asRows" class="border-t border-border">
      <summary class="cursor-pointer px-5 py-2.5 text-xs font-medium text-foreground">Show JSON-LD</summary>
      <div class="border-t border-border p-5">
        <div class="mb-2 flex justify-end">
          <CopyButton :value="json" label="Copy the JSON-LD" />
        </div>
        <pre class="max-h-96 overflow-auto rounded-md bg-muted/30 p-3 text-[11px] leading-relaxed"><code>{{ json }}</code></pre>
      </div>
    </details>
  </section>

  <EmptyState v-else title="Pick something on the left to edit it." />
</template>
