<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { displayName, orderedEntities, typeLabel, type CrateDraft, type DraftEntity } from '@/lib/crate/editor'
import { isAbsoluteUri, normalizeTypeUri } from '@/lib/profiles/uri'
import type { VocabIndex } from '@/lib/profiles/vocabulary'

const props = defineProps<{ draft: CrateDraft; vocab: VocabIndex | null; range: string[] }>()
const emit = defineEmits<{
  (e: 'pick', id: string): void
  (e: 'close'): void
}>()

const query = ref('')
const url = ref('')

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
const listed = computed(() => [
  ...candidates.value.filter(inRange),
  ...candidates.value.filter((entity) => !inRange(entity)),
])
const urlInvalid = computed(() => Boolean(url.value.trim()) && !isAbsoluteUri(url.value.trim()))
</script>

<template>
  <div class="absolute left-0 top-full z-30 mt-1 w-80 rounded-md border border-border bg-popover p-2 shadow-md">
    <Input v-model="query" placeholder="Search this dataset" aria-label="Search entities in this dataset" />
    <ul class="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
      <li v-for="entity in listed" :key="entity.id">
        <button
          type="button"
          class="flex w-full flex-col items-start px-2.5 py-1.5 text-left text-xs hover:bg-muted/40"
          @click="emit('pick', entity.id)"
        >
          <span class="font-medium text-foreground">{{ displayName(entity) }}</span>
          <span class="text-muted-foreground">{{ entity.types.map(typeLabel).join(', ') }}</span>
        </button>
      </li>
      <li v-if="!listed.length" class="px-2.5 py-2 text-xs text-muted-foreground">
        Nothing in this dataset matches.
      </li>
    </ul>

    <div class="mt-2 border-t border-border pt-2">
      <p class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">External URL</p>
      <div class="mt-1 flex items-start gap-2">
        <Input
          v-model="url"
          class="min-w-0 flex-1"
          placeholder="https://example.org/thing"
          aria-label="External URL"
          :invalid="urlInvalid ? 'error' : undefined"
          @keydown.enter="!urlInvalid && url.trim() && emit('pick', url.trim())"
        />
        <Button size="sm" :disabled="!url.trim() || urlInvalid" @click="emit('pick', url.trim())">Link</Button>
      </div>
      <p v-if="urlInvalid" class="mt-1 text-[11px] text-destructive">That is not an absolute URL.</p>
    </div>

    <div class="mt-2 flex justify-end">
      <Button variant="ghost" size="sm" @click="emit('close')">Close</Button>
    </div>
  </div>
</template>
