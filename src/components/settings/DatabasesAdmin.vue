<script setup lang="ts">
// Realm admins mark a bucket as a database and link the dataset that describes it.
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import DatasetPreview from '@/components/data/DatasetPreview.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import { NEW_DATASET, useMockDatabases } from '@/composables/useMockDatabases'
import { DATABASES_PATH } from '@/lib/distributedMock'
import { MOCK_BUCKETS, OWNING_GROUP, REALM_ROLES } from '@/lib/distributedMockData'
import { Pencil, Plus, Trash2 } from '@lucide/vue'

const { all: entries, curators, own, add, agree, remove, grant } = useMockDatabases()

const granting = ref(false)
const roleChoice = ref('')
const newRole = ref('')
const grantable = computed(() => REALM_ROLES.filter((role) => !curators.value.some((item) => item.name === role.name)))

function grantRole() {
  const existing = REALM_ROLES.find((role) => role.name === roleChoice.value)
  const name = newRole.value.trim()
  if (existing) grant(existing)
  else if (name) grant({ name, users: [] })
  granting.value = false
  roleChoice.value = ''
  newRole.value = ''
}

const free = computed(() => MOCK_BUCKETS.map((bucket) => bucket.name).filter((name) => !entries.value.some((entry) => entry.bucket === name)))
const bucket = ref('')
const dataset = ref('')
const datasetChoices = computed(() => [
  { value: NEW_DATASET, label: 'Create a dataset for this database' },
  ...own(OWNING_GROUP[bucket.value] ?? '').map((item) => ({ value: item.id, label: item.name })),
])

function mark() {
  if (!bucket.value || !dataset.value) return
  add(bucket.value, dataset.value)
  bucket.value = ''
  dataset.value = ''
}
</script>

<template>
  <div class="space-y-6">
    <MockNotice />
    <section class="space-y-3">
      <div>
        <h2 class="font-display text-base font-semibold text-aruna-navy">Who can create databases</h2>
        <p class="text-xs text-muted-foreground">
          Realm admins always can. Members of the roles below can mark buckets as databases. The group that owns a bucket must agree.
        </p>
      </div>
      <ul class="divide-y divide-border rounded-md border border-border">
        <li v-for="role in curators" :key="role.name" class="px-4 py-3 text-sm">
          <span class="font-medium text-foreground">{{ role.name }}</span>
          <span class="ml-2 text-xs text-muted-foreground">{{ role.users.length ? role.users.join(', ') : 'No members yet' }}</span>
          <p class="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{{ DATABASES_PATH }} <span class="uppercase">write</span></p>
        </li>
      </ul>
      <Button v-if="!granting" size="sm" variant="outline" @click="granting = true"><Plus class="size-3.5" /> Grant to a role</Button>
      <div v-else class="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
        <Select v-model="roleChoice" :options="grantable.map((role) => ({ value: role.name, label: role.name }))" placeholder="An existing realm role" aria-label="Existing realm role" />
        <Input v-model="newRole" placeholder="Or the name of a new role" aria-label="New role name" />
        <p class="text-xs text-muted-foreground sm:col-span-2">
          Adds the access rule <span class="font-mono">admin/databases</span> with WRITE to the role, like an access rule in the role builder.
        </p>
        <div class="flex gap-2 sm:col-span-2">
          <Button size="sm" :disabled="!roleChoice && !newRole.trim()" @click="grantRole">Grant WRITE</Button>
          <Button size="sm" variant="ghost" @click="granting = false">Cancel</Button>
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <div>
        <h2 class="font-display text-base font-semibold text-aruna-navy">Databases</h2>
        <p class="text-xs text-muted-foreground">
          Mark a bucket as a database and link the dataset that describes it. A database is an ordinary bucket: the mark grants nothing, and who may read it is decided by the permissions of the bucket.
        </p>
      </div>
      <ul class="divide-y divide-border rounded-md border border-border">
        <li v-for="entry in entries" :key="entry.id" class="px-4 py-3">
          <div class="flex flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-foreground">
                {{ entry.dataset.name }} <span class="font-mono text-xs font-normal text-muted-foreground">{{ entry.bucket }}</span>
                <Badge v-if="entry.status === 'pending'" variant="warn" size="sm" class="ml-1">Waiting for the group admins of {{ OWNING_GROUP[entry.bucket] }}</Badge>
              </p>
              <p class="text-xs text-muted-foreground">{{ entry.dataset.description || 'No description yet.' }}</p>
              <p class="text-xs text-muted-foreground">Dataset <span class="font-mono">{{ entry.datasetId }}</span> · {{ entry.readers }}</p>
          </div>
          <Button v-if="entry.status === 'pending'" size="sm" variant="outline" title="Mock: shows what happens when the group admins agree" @click="agree(entry.id)">Group admins agree</Button>
          <Button size="sm" variant="outline" as-child>
            <RouterLink :to="{ name: 'dataset-edit', params: { id: entry.datasetId } }"><Pencil class="size-3.5" /> Edit the dataset</RouterLink>
          </Button>
          <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" :aria-label="`Remove ${entry.dataset.name}`" @click="remove(entry.id)"><Trash2 class="size-3.5" /> Remove</Button>
          </div>
          <details class="mt-2 text-xs">
            <summary class="cursor-pointer text-muted-foreground">Dataset</summary>
            <div class="mt-2"><DatasetPreview :dataset-id="entry.datasetId" /></div>
          </details>
        </li>
        <li v-if="!entries.length" class="px-4 py-6 text-center text-sm text-muted-foreground">No bucket is marked as a database yet.</li>
      </ul>
    </section>

    <section class="space-y-3 rounded-md border border-border p-4">
      <h3 class="text-sm font-medium text-foreground">Mark a bucket as a database</h3>
      <p class="text-xs text-muted-foreground">The group that owns the bucket must agree. Until then the entry waits for its group admins.</p>
      <p v-if="!free.length" class="text-xs text-muted-foreground">Every example bucket is already marked.</p>
      <div v-else class="grid gap-3 sm:grid-cols-2">
        <Select v-model="bucket" :options="free.map((name) => ({ value: name, label: name }))" placeholder="Bucket" aria-label="Bucket" @update:model-value="dataset = ''" />
        <Select v-model="dataset" :options="datasetChoices" placeholder="Dataset" aria-label="Dataset" :disabled="!bucket" />
        <p v-if="dataset === NEW_DATASET" class="text-xs text-muted-foreground sm:col-span-2">
          The new dataset is named {{ bucket }} and links the bucket as one part. Describe it in the dataset editor.
        </p>
        <div class="sm:col-span-2"><Button size="sm" :disabled="!bucket || !dataset" @click="mark"><Plus class="size-3.5" /> Mark as database</Button></div>
      </div>
    </section>
  </div>
</template>
