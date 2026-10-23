<script setup lang="ts">
// A small preview of a dataset: its linked parts as folder-like rows and its RO-Crate.
// A linked part always shows the current files. Browse into it like any folder.
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import Select from '@/components/ui/Select.vue'
import { useMockDatabases } from '@/composables/useMockDatabases'
import { crateOf, MOCK_BUCKETS, partLabel, type LinkedPart } from '@/lib/distributedMockData'
import { Folder, Plus } from '@lucide/vue'

const props = defineProps<{ datasetId: string }>()

const { datasets, entries, linkPart } = useMockDatabases()
const dataset = computed(() => datasets.value.find((item) => item.id === props.datasetId))
const KINDS = [
  { value: 'bucket', label: 'Bucket' },
  { value: 'folder', label: 'Folder in a bucket' },
  { value: 'database', label: 'Database' },
]

const adding = ref(false)
const draft = ref({ kind: 'bucket' as LinkedPart['kind'], bucket: '', prefix: '' })
const choices = computed(() =>
  draft.value.kind === 'database'
    ? entries.value.map((entry) => ({ value: entry.bucket, label: entry.dataset.name }))
    : MOCK_BUCKETS.map((bucket) => ({ value: bucket.name, label: bucket.name })),
)

function link() {
  if (!draft.value.bucket) return
  const { kind, bucket, prefix } = draft.value
  linkPart(props.datasetId, { kind, bucket, ...(kind === 'folder' && prefix ? { prefix: prefix.replace(/\/$/, '') } : {}) })
  adding.value = false
  draft.value = { kind: 'bucket', bucket: '', prefix: '' }
}
</script>

<template>
  <div v-if="dataset" class="space-y-3 text-xs">
    <div>
      <p class="mb-1 text-muted-foreground">Linked parts</p>
      <ul class="divide-y divide-border rounded-md border border-border">
        <li v-for="part in dataset.parts" :key="partLabel(part)" class="flex items-center gap-2 px-3 py-2">
          <Folder class="size-3.5 shrink-0 text-primary" />
          <RouterLink
            :to="{ name: 'bucket', params: { bucketId: part.bucket }, query: part.prefix ? { prefix: part.prefix } : {} }"
            class="text-primary hover:underline"
          >{{ partLabel(part) }}</RouterLink>
        </li>
      </ul>
      <p class="mt-1 text-muted-foreground">The files stay unnamed under the part. A linked bucket or folder always shows the current files. A linked database is only a link between datasets.</p>
    </div>
    <Button v-if="!adding" size="sm" variant="outline" @click="adding = true"><Plus class="size-3.5" /> Add a linked bucket or folder</Button>
    <div v-else class="grid gap-2 sm:grid-cols-2">
      <OptionToggle v-model="draft.kind" :options="KINDS" aria-label="Kind of linked part" class="sm:col-span-2" />
      <Select v-model="draft.bucket" :options="choices" placeholder="Choose" aria-label="Linked bucket or database" />
      <Input v-if="draft.kind === 'folder'" v-model="draft.prefix" placeholder="Folder, for example raw/2026" aria-label="Folder" />
      <div class="flex gap-2 sm:col-span-2">
        <Button size="sm" :disabled="!draft.bucket" @click="link">Link</Button>
        <Button size="sm" variant="ghost" @click="adding = false">Cancel</Button>
      </div>
    </div>
    <details>
      <summary class="cursor-pointer text-muted-foreground">Preview of the RO-Crate</summary>
      <pre class="mt-2 overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-[11px]">{{ JSON.stringify(crateOf(dataset), null, 2) }}</pre>
    </details>
  </div>
</template>
