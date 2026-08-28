<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import SelectDataDialog from '@/components/data/SelectDataDialog.vue'
import SubcratePickerDialog from '@/components/metadata/SubcratePickerDialog.vue'
import { useAruna } from '@/composables/useAruna'
import { takeSelectedContentReference } from '@/lib/contentIdentity'
import { isAbsoluteUri } from '@/lib/profiles/uri'
import type { MetadataDocumentListItem } from '@/lib/api'
import type { Part } from '@/lib/crate/build'
import { Database, ExternalLink, FileJson2, Plus, Trash2 } from '@lucide/vue'

const props = defineProps<{ modelValue: Part[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', parts: Part[]): void }>()
const { apiBaseUrl } = useAruna()

const selectDataOpen = ref(false)
const subcrateOpen = ref(false)
const externalOpen = ref(false)
const externalName = ref('')
const externalUrl = ref('')
const externalInvalid = ref(false)

const excludedIris = computed(() => props.modelValue
  .filter((part): part is Extract<Part, { kind: 'dataset' }> => part.kind === 'dataset')
  .map((part) => part.link.iri))

function commit(parts: Part[]) {
  emit('update:modelValue', parts)
}

function addSelected(entry: { label: string; url: string }) {
  if (props.modelValue.some((part) => partId(part) === entry.url)) return
  const selected = takeSelectedContentReference(entry.url)
  if (!selected || selected.identity === 'external') {
    commit([...props.modelValue, { kind: 'external', url: entry.url, name: entry.label || undefined }])
    return
  }
  commit([...props.modelValue, {
    kind: 'object',
    id: entry.url,
    name: entry.label || entry.url,
    contentUrl: selected.contentUrl,
    identity: selected.identity,
  }])
}

function addExternal() {
  const url = externalUrl.value.trim()
  externalInvalid.value = !isAbsoluteUri(url)
  if (externalInvalid.value || props.modelValue.some((part) => partId(part) === url)) return
  commit([...props.modelValue, { kind: 'external', url, name: externalName.value.trim() || undefined }])
  externalName.value = ''
  externalUrl.value = ''
  externalOpen.value = false
}

function addDatasets(items: MetadataDocumentListItem[]) {
  const next = [...props.modelValue]
  for (const item of items) {
    if (!item.graph_iri || next.some((part) => partId(part) === item.graph_iri)) continue
    next.push({
      kind: 'dataset',
      link: {
        iri: item.graph_iri,
        name: item.document_path,
        identifier: item.document_id,
        subjectOf: `${apiBaseUrl.value.replace(/\/+$/, '')}/metadata/${encodeURIComponent(item.document_id)}/rocrate`,
      },
    })
  }
  commit(next)
  subcrateOpen.value = false
}

function partId(part: Part): string {
  if (part.kind === 'object') return part.id
  if (part.kind === 'external') return part.url
  return part.link.iri
}

function partName(part: Part): string {
  if (part.kind === 'object') return part.name
  if (part.kind === 'external') return part.name || part.url
  return part.link.name
}

function kindLabel(part: Part): string {
  if (part.kind === 'object') return 'Object'
  if (part.kind === 'external') return 'External URL'
  return 'Dataset'
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <Button size="sm" @click="selectDataOpen = true"><Database class="h-3.5 w-3.5" /> Add object</Button>
      <Button size="sm" variant="outline" @click="externalOpen = !externalOpen"><ExternalLink class="h-3.5 w-3.5" /> External URL</Button>
      <Button size="sm" variant="outline" @click="subcrateOpen = true"><FileJson2 class="h-3.5 w-3.5" /> Existing dataset</Button>
    </div>

    <div v-if="externalOpen" class="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1.5fr_auto]">
      <Input v-model="externalName" placeholder="Label" />
      <div>
        <Input v-model="externalUrl" placeholder="https://example.org/data" :invalid="externalInvalid ? 'error' : undefined" @keydown.enter="addExternal" />
        <p v-if="externalInvalid" class="mt-1 text-[11px] text-destructive">Enter an absolute URL.</p>
      </div>
      <Button size="sm" @click="addExternal"><Plus class="h-3.5 w-3.5" /> Add</Button>
    </div>

    <p v-if="!modelValue.length" class="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
      No parts added yet.
    </p>
    <div v-for="(part, index) in modelValue" :key="partId(part)" class="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate text-sm font-medium text-foreground">{{ partName(part) }}</span>
          <Badge variant="secondary">{{ kindLabel(part) }}</Badge>
        </div>
        <p class="truncate font-mono text-[11px] text-muted-foreground">{{ partId(part) }}</p>
      </div>
      <Button variant="ghost" size="icon-sm" :aria-label="`Remove ${partName(part)}`" @click="commit(modelValue.filter((_, itemIndex) => itemIndex !== index))">
        <Trash2 class="h-3.5 w-3.5" />
      </Button>
    </div>

    <SelectDataDialog v-model:open="selectDataOpen" @add="addSelected" />
    <SubcratePickerDialog
      v-model:open="subcrateOpen"
      :excluded-iris="excludedIris"
      @select="addDatasets"
    />
  </div>
</template>
