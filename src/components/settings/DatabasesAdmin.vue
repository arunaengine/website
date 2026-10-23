<script setup lang="ts">
// Realm admins curate the database list: add an entry from an existing bucket, edit its texts, remove it.
import { computed, ref } from 'vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { useMockDatabases } from '@/composables/useMockDatabases'
import { REFRESH_OPTIONS } from '@/lib/distributedMock'
import { MOCK_BUCKETS, type DatabaseReaders } from '@/lib/distributedMockData'
import { Pencil, Plus, Trash2 } from '@lucide/vue'

const { entries, add, update, remove } = useMockDatabases()

const READERS = [
  { value: 'Everyone in the realm', label: 'Everyone in the realm' },
  { value: 'Public', label: 'Public' },
]
const refreshOptions = REFRESH_OPTIONS.map(({ label }) => ({ value: label, label }))

const editing = ref('')
const free = computed(() => MOCK_BUCKETS.map((bucket) => bucket.name).filter((name) => !entries.value.some((entry) => entry.bucket === name)))
const draft = ref({ bucket: '', name: '', description: '', source: '', license: '', refresh: 'Off', readers: 'Everyone in the realm' as DatabaseReaders })

function create() {
  if (!draft.value.bucket) return
  add({ ...draft.value, name: draft.value.name.trim() || draft.value.bucket })
  draft.value = { bucket: '', name: '', description: '', source: '', license: '', refresh: 'Off', readers: 'Everyone in the realm' }
}
</script>

<template>
  <div class="space-y-6">
    <MockNotice />
    <section class="space-y-3">
      <div>
        <h2 class="font-display text-base font-semibold text-aruna-navy">Databases</h2>
        <p class="text-xs text-muted-foreground">
          The list people see under Databases in the Data section. An entry grants nothing: who may read a database is decided by the permissions of its bucket.
        </p>
      </div>
      <ul class="divide-y divide-border rounded-md border border-border">
        <li v-for="entry in entries" :key="entry.id" class="space-y-3 px-4 py-3">
          <div class="flex flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-foreground">{{ entry.name }} <span class="font-mono text-xs font-normal text-muted-foreground">{{ entry.bucket }}</span></p>
              <p class="text-xs text-muted-foreground">{{ entry.description }}</p>
              <p class="text-xs text-muted-foreground">{{ entry.source }} · {{ entry.license }} · {{ entry.refresh }} · {{ entry.readers }}</p>
            </div>
            <Button size="sm" variant="outline" @click="editing = editing === entry.id ? '' : entry.id"><Pencil class="size-3.5" /> Edit</Button>
            <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" :aria-label="`Remove ${entry.name}`" @click="remove(entry.id)"><Trash2 class="size-3.5" /> Remove</Button>
          </div>
          <div v-if="editing === entry.id" class="grid gap-3 sm:grid-cols-2">
            <Textarea :model-value="entry.description" rows="2" class="sm:col-span-2 font-sans" aria-label="Description" @update:model-value="update(entry.id, { description: $event })" />
            <Input :model-value="entry.source" placeholder="Source" aria-label="Source" @update:model-value="update(entry.id, { source: String($event) })" />
            <Input :model-value="entry.license" placeholder="License" aria-label="License" @update:model-value="update(entry.id, { license: String($event) })" />
            <Select :model-value="entry.refresh" :options="refreshOptions" aria-label="Refresh interval" @update:model-value="update(entry.id, { refresh: $event })" />
            <Select :model-value="entry.readers" :options="READERS" aria-label="Who may read" @update:model-value="update(entry.id, { readers: $event as DatabaseReaders })" />
          </div>
        </li>
        <li v-if="!entries.length" class="px-4 py-6 text-center text-sm text-muted-foreground">No databases are listed yet.</li>
      </ul>
    </section>

    <section class="space-y-3 rounded-md border border-border p-4">
      <h3 class="text-sm font-medium text-foreground">Add an entry from an existing bucket</h3>
      <p v-if="!free.length" class="text-xs text-muted-foreground">Every example bucket is already listed.</p>
      <div v-else class="grid gap-3 sm:grid-cols-2">
        <Select v-model="draft.bucket" :options="free.map((name) => ({ value: name, label: name }))" placeholder="Bucket" aria-label="Bucket" />
        <Input v-model="draft.name" placeholder="Name shown to users" aria-label="Name" />
        <Textarea v-model="draft.description" rows="2" class="sm:col-span-2 font-sans" placeholder="Short description" aria-label="New description" />
        <Input v-model="draft.source" placeholder="Source" aria-label="New source" />
        <Input v-model="draft.license" placeholder="License" aria-label="New license" />
        <Select v-model="draft.refresh" :options="refreshOptions" aria-label="New refresh interval" />
        <Select v-model="draft.readers" :options="READERS" aria-label="New readers" />
        <div class="sm:col-span-2"><Button size="sm" :disabled="!draft.bucket" @click="create"><Plus class="size-3.5" /> Add to the list</Button></div>
      </div>
    </section>
  </div>
</template>
