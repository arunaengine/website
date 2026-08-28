<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import LookupBox from '@/components/metadata/LookupBox.vue'
import TypeBrowser from './TypeBrowser.vue'
import {
  addEntity,
  autoId,
  idHint,
  typeLabel,
  type CrateDraft,
  type DraftEntity,
  type DraftValue,
} from '@/lib/crate/editor'
import { fetchOrcidRecord } from '@/lib/lookup/orcid'
import { fetchRorRecord } from '@/lib/lookup/ror'
import type { LookupHit, RegistryRecord } from '@/lib/lookup/types'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{
  open: boolean
  draft: CrateDraft
  vocab: VocabIndex | null
  range?: string[]
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'created', value: { draft: CrateDraft; entity: DraftEntity }): void
}>()

const step = ref<'type' | 'details'>('type')
const type = ref('')
const onlyMatching = ref(Boolean(props.range?.length))
const name = ref('')
const identifier = ref('')
const idTouched = ref(false)
const tab = ref<'manual' | 'import'>('manual')
const registryValue = ref('')
const registryError = ref('')
const importing = ref(false)
const extra = ref<Record<string, DraftValue[]>>({})

const registry = computed(() => {
  const label = typeLabel(type.value)
  if (label === 'Person') return { kind: 'person' as const, label: 'ORCID' }
  return label === 'Organization' ? { kind: 'organization' as const, label: 'ROR' } : null
})

watch(() => props.open, (open) => {
  if (!open) return
  step.value = 'type'
  type.value = ''
  onlyMatching.value = Boolean(props.range?.length)
  name.value = ''
  identifier.value = ''
  idTouched.value = false
  tab.value = 'manual'
  registryValue.value = ''
  registryError.value = ''
  extra.value = {}
}, { immediate: true })

// The identifier follows the name until someone edits it themselves.
watch([name, type], () => {
  if (idTouched.value) return
  identifier.value = autoId(name.value || typeLabel(type.value), props.draft.entities.map((entity) => entity.id))
})

function text(value: string): DraftValue[] {
  return [{ kind: 'text', value }]
}

function applyRecord(record: RegistryRecord) {
  name.value = record.name
  identifier.value = record.id
  idTouched.value = true
  extra.value = {
    ...(record.givenName ? { givenName: text(record.givenName) } : {}),
    ...(record.familyName ? { familyName: text(record.familyName) } : {}),
    ...(record.url ? { url: [{ kind: 'url' as const, value: record.url }] } : {}),
  }
}

async function importRecord() {
  const value = registryValue.value.trim()
  if (!value || !registry.value) return
  importing.value = true
  registryError.value = ''
  try {
    applyRecord(registry.value.kind === 'person' ? await fetchOrcidRecord(value) : await fetchRorRecord(value))
    tab.value = 'manual'
  } catch (error) {
    registryError.value = errorMessage(error)
  } finally {
    importing.value = false
  }
}

function useHit(hit: LookupHit) {
  const properties = hit.entity.properties
  const value = (key: string) => (typeof properties[key] === 'string' ? String(properties[key]) : '')
  applyRecord({
    id: hit.id,
    name: hit.label,
    ...(value('givenName') ? { givenName: value('givenName') } : {}),
    ...(value('familyName') ? { familyName: value('familyName') } : {}),
    ...(value('url') ? { url: value('url') } : {}),
  })
  tab.value = 'manual'
}

const canCreate = computed(() => Boolean(type.value && identifier.value.trim()))

function create() {
  if (!canCreate.value) return
  const created = addEntity(props.draft, {
    type: type.value,
    name: name.value,
    id: identifier.value,
    properties: extra.value,
  })
  emit('created', created)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ step === 'type' ? 'What are you adding?' : `New ${typeLabel(type)}` }}</DialogTitle>
        <DialogDescription>
          {{ step === 'type'
            ? 'Pick the kind of thing this is. Everything in the dataset is described the same way.'
            : 'Give it a name; the identifier is filled in for you.' }}
        </DialogDescription>
      </DialogHeader>

      <div class="max-h-[60vh] space-y-4 overflow-y-auto px-1">
        <TypeBrowser
          v-if="step === 'type'"
          v-model="type"
          v-model:only-matching="onlyMatching"
          :vocab="vocab"
          :range="range"
        />

        <template v-else>
          <div v-if="registry" class="flex gap-2 border-b border-border">
            <button
              v-for="option in [{ id: 'manual', label: 'Enter details' }, { id: 'import', label: `Import from ${registry.label}` }]"
              :key="option.id"
              type="button"
              class="-mb-px border-b-2 px-3 py-1.5 text-xs font-medium"
              :class="tab === option.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'"
              @click="tab = option.id as 'manual' | 'import'"
            >
              {{ option.label }}
            </button>
          </div>

          <div v-if="registry && tab === 'import'" class="space-y-3">
            <div class="flex items-start gap-2">
              <div class="min-w-0 flex-1">
                <Input
                  v-model="registryValue"
                  :placeholder="registry.kind === 'person' ? '0000-0002-1825-0097' : '03yrm5c26'"
                  :aria-label="`${registry.label} identifier`"
                  @keydown.enter="importRecord"
                />
                <p class="mt-1 text-[11px] text-muted-foreground">Paste the identifier or its URL, then press Enter.</p>
              </div>
              <Button
                size="sm"
                aria-label="Import this record"
                :disabled="importing || !registryValue.trim()"
                @click="importRecord"
              >
                <Spinner v-if="importing" class="text-current" aria-hidden="true" />
                Import
              </Button>
            </div>
            <Notice v-if="registryError" tone="warning">{{ registryError }}</Notice>
            <div>
              <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Or search by name</p>
              <LookupBox :kind="registry.kind" @select="useHit" />
            </div>
          </div>

          <div v-else class="space-y-3">
            <div>
              <label class="text-xs font-medium text-foreground">Name</label>
              <Input v-model="name" class="mt-1" aria-label="Name" @keydown.enter="create" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Identifier</label>
              <Input
                :model-value="identifier"
                class="mt-1 font-mono text-xs"
                aria-label="Identifier"
                @update:model-value="(value: string | number) => { identifier = String(value); idTouched = true }"
              />
              <p class="mt-1 text-[11px] text-muted-foreground">{{ idHint(type) }}</p>
            </div>
          </div>
        </template>
      </div>

      <DialogFooter>
        <Button v-if="step === 'details'" variant="outline" @click="step = 'type'">Back</Button>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button v-if="step === 'type'" :disabled="!type" @click="step = 'details'">Continue</Button>
        <Button v-else :disabled="!canCreate" @click="create">Create</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
