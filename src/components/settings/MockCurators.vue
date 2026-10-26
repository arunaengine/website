<script setup lang="ts">
// Example roles that hold the right to create databases. The node has no route to read or grant
// realm roles yet, so this part shows example data only.
import { computed, ref } from 'vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import { useMockDatabases } from '@/composables/useMockDatabases'
import { DATABASES_PATH } from '@/lib/distributedMock'
import { REALM_ROLES } from '@/lib/distributedMockData'
import { Plus } from '@lucide/vue'

const { curators, grant } = useMockDatabases()

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
</script>

<template>
  <div class="space-y-3">
    <MockNotice />
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
        Adds the access rule <span class="font-mono">admin/databases</span> with WRITE to the role.
      </p>
      <div class="flex gap-2 sm:col-span-2">
        <Button size="sm" :disabled="!roleChoice && !newRole.trim()" @click="grantRole">Grant WRITE</Button>
        <Button size="sm" variant="ghost" @click="granting = false">Cancel</Button>
      </div>
    </div>
  </div>
</template>
