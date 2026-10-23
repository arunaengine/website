<script setup lang="ts">
// Realm admins mark a bucket as a database bucket and describe it: add, edit and remove.
import { computed, ref } from 'vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { useMockDatabases } from '@/composables/useMockDatabases'
import { DATABASE_BUCKETS_PATH, REFRESH_OPTIONS } from '@/lib/distributedMock'
import { MOCK_BUCKETS, OWNING_GROUP, REALM_ROLES, type DatabaseReaders } from '@/lib/distributedMockData'
import { Pencil, Plus, Trash2 } from '@lucide/vue'

const { all: entries, curators, add, agree, update, remove, grant } = useMockDatabases()

const READERS = [
  { value: 'Everyone in the realm', label: 'Everyone in the realm' },
  { value: 'Public', label: 'Public' },
]
const refreshOptions = REFRESH_OPTIONS.map(({ label }) => ({ value: label, label }))

const editing = ref('')
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
        <h2 class="font-display text-base font-semibold text-aruna-navy">Who can create database buckets</h2>
        <p class="text-xs text-muted-foreground">
          Realm admins always can. Members of the roles below can mark buckets as database buckets. The group that owns a bucket must agree.
        </p>
      </div>
      <ul class="divide-y divide-border rounded-md border border-border">
        <li v-for="role in curators" :key="role.name" class="px-4 py-3 text-sm">
          <span class="font-medium text-foreground">{{ role.name }}</span>
          <span class="ml-2 text-xs text-muted-foreground">{{ role.users.length ? role.users.join(', ') : 'No members yet' }}</span>
          <p class="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{{ DATABASE_BUCKETS_PATH }} <span class="uppercase">write</span></p>
        </li>
      </ul>
      <Button v-if="!granting" size="sm" variant="outline" @click="granting = true"><Plus class="size-3.5" /> Grant to a role</Button>
      <div v-else class="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
        <Select v-model="roleChoice" :options="grantable.map((role) => ({ value: role.name, label: role.name }))" placeholder="An existing realm role" aria-label="Existing realm role" />
        <Input v-model="newRole" placeholder="Or the name of a new role" aria-label="New role name" />
        <p class="text-xs text-muted-foreground sm:col-span-2">
          Adds the access rule <span class="font-mono">admin/database-buckets</span> with WRITE to the role, like an access rule in the role builder.
        </p>
        <div class="flex gap-2 sm:col-span-2">
          <Button size="sm" :disabled="!roleChoice && !newRole.trim()" @click="grantRole">Grant WRITE</Button>
          <Button size="sm" variant="ghost" @click="granting = false">Cancel</Button>
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <div>
        <h2 class="font-display text-base font-semibold text-aruna-navy">Database buckets</h2>
        <p class="text-xs text-muted-foreground">
          Mark a bucket as a database bucket and describe it. A database bucket is an ordinary bucket: the mark grants nothing, and who may read it is decided by the permissions of the bucket.
        </p>
      </div>
      <ul class="divide-y divide-border rounded-md border border-border">
        <li v-for="entry in entries" :key="entry.id" class="space-y-3 px-4 py-3">
          <div class="flex flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-foreground">
                {{ entry.name }} <span class="font-mono text-xs font-normal text-muted-foreground">{{ entry.bucket }}</span>
                <Badge v-if="entry.status === 'pending'" variant="warn" size="sm" class="ml-1">Waiting for the group admins of {{ OWNING_GROUP[entry.bucket] }}</Badge>
              </p>
              <p class="text-xs text-muted-foreground">{{ entry.description }}</p>
              <p class="text-xs text-muted-foreground">{{ entry.source }} · {{ entry.license }} · {{ entry.refresh }} · {{ entry.readers }}</p>
            </div>
            <Button v-if="entry.status === 'pending'" size="sm" variant="outline" title="Mock: shows what happens when the group admins agree" @click="agree(entry.id)">Group admins agree</Button>
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
        <li v-if="!entries.length" class="px-4 py-6 text-center text-sm text-muted-foreground">No bucket is marked as a database bucket yet.</li>
      </ul>
    </section>

    <section class="space-y-3 rounded-md border border-border p-4">
      <h3 class="text-sm font-medium text-foreground">Mark an existing bucket as a database bucket</h3>
      <p class="text-xs text-muted-foreground">The group that owns the bucket must agree. Until then the entry waits for its group admins.</p>
      <p v-if="!free.length" class="text-xs text-muted-foreground">Every example bucket is already marked.</p>
      <div v-else class="grid gap-3 sm:grid-cols-2">
        <Select v-model="draft.bucket" :options="free.map((name) => ({ value: name, label: name }))" placeholder="Bucket" aria-label="Bucket" />
        <Input v-model="draft.name" placeholder="Name shown to users" aria-label="Name" />
        <Textarea v-model="draft.description" rows="2" class="sm:col-span-2 font-sans" placeholder="Short description" aria-label="New description" />
        <Input v-model="draft.source" placeholder="Source" aria-label="New source" />
        <Input v-model="draft.license" placeholder="License" aria-label="New license" />
        <Select v-model="draft.refresh" :options="refreshOptions" aria-label="New refresh interval" />
        <Select v-model="draft.readers" :options="READERS" aria-label="New readers" />
        <div class="sm:col-span-2"><Button size="sm" :disabled="!draft.bucket" @click="create"><Plus class="size-3.5" /> Mark as database bucket</Button></div>
      </div>
    </section>
  </div>
</template>
