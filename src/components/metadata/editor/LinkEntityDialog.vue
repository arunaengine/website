<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import CommandDialog from '@/components/ui/CommandDialog.vue'
import Input from '@/components/ui/Input.vue'
import { entityIcon } from './icons'
import { displayName, orderedEntities, rootId, typeLabel, type CrateDraft, type DraftEntity } from '@/lib/crate/editor'
import { isAbsoluteUri, normalizeTypeUri } from '@/lib/profiles/uri'
import type { VocabIndex } from '@/lib/profiles/vocabulary'

const props = defineProps<{ open: boolean; draft: CrateDraft; vocab: VocabIndex | null; range: string[] }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'pick', id: string): void
}>()

const query = ref('')
const url = ref('')

watch(() => props.open, (open) => {
  if (!open) return
  query.value = ''
  url.value = ''
})

const allowed = computed(() =>
  new Set((props.vocab?.classesInRange(props.range) ?? []).map((term) => term.uri)))

function matches(entity: DraftEntity): boolean {
  const text = query.value.trim().toLowerCase()
  if (!text) return true
  return `${displayName(entity)} ${entity.id} ${entity.types.join(' ')}`.toLowerCase().includes(text)
}

function inRange(entity: DraftEntity): boolean {
  if (!allowed.value.size) return true
  return entity.types.some((type) => allowed.value.has(normalizeTypeUri(type)))
}

const candidates = computed(() => orderedEntities(props.draft).filter(matches))
// What fits the property comes first; the rest stays reachable.
const listed = computed(() => [
  ...candidates.value.filter(inRange),
  ...candidates.value.filter((entity) => !inRange(entity)),
])
const urlInvalid = computed(() => Boolean(url.value.trim()) && !isAbsoluteUri(url.value.trim()))

function pick(id: string) {
  emit('pick', id)
  emit('update:open', false)
}

function pickUrl() {
  const value = url.value.trim()
  if (value && !urlInvalid.value) pick(value)
}
</script>

<template>
  <CommandDialog
    :open="open"
    v-model="query"
    title="Link an entity"
    description="Something already in this dataset, or a URL outside it."
    placeholder="Search this dataset"
    aria-label="Search entities in this dataset"
    @update:open="(value) => emit('update:open', value)"
  >
    <button
      v-for="entity in listed"
      :key="entity.id"
      type="button"
      role="option"
      class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-muted/40 data-[active=true]:bg-muted"
      :class="inRange(entity) ? '' : 'opacity-60'"
      @click="pick(entity.id)"
    >
      <component :is="entityIcon(entity, entity.id === rootId(draft))" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1">
        <span class="block truncate font-medium text-foreground">{{ displayName(entity) }}</span>
        <span class="block truncate text-muted-foreground">{{ entity.types.map(typeLabel).join(', ') }}</span>
      </span>
    </button>
    <p v-if="!listed.length" class="px-2.5 py-2 text-xs text-muted-foreground">Nothing in this dataset matches.</p>

    <template #footer>
      <p class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">External URL</p>
      <div class="mt-1 flex items-start gap-2">
        <Input
          v-model="url"
          class="min-w-0 flex-1"
          placeholder="https://example.org/thing"
          aria-label="External URL"
          :invalid="urlInvalid ? 'error' : undefined"
          @keydown.enter="pickUrl"
        />
        <Button size="sm" class="h-9" :disabled="!url.trim() || urlInvalid" @click="pickUrl">Link</Button>
      </div>
      <p v-if="urlInvalid" class="mt-1 text-[11px] text-destructive">That is not an absolute URL.</p>
    </template>
  </CommandDialog>
</template>
