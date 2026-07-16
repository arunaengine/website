<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Badge from '@/components/ui/Badge.vue'
import PermissionPathPicker from './PermissionPathPicker.vue'
import { computed, ref } from 'vue'
import { ChevronRight, FolderSearch, Lock, Plus, Trash2 } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import type { ApiRole, GroupDetailResponse, GroupPermissionLevel } from '@/lib/api'

const props = defineProps<{
  group: GroupDetailResponse
  canManage: boolean
}>()

const emit = defineEmits<{ (e: 'changed'): void }>()

const { createGroupRole, deleteGroupRole, saving } = useAruna()

const roleError = ref<string | null>(null)
const newRoleName = ref('')
const newPathSuffix = ref('')
const newLevel = ref<GroupPermissionLevel>('read')
const showPathBrowser = ref(false)

const pathPrefix = computed(() => `/${props.group.realm_id}/g/${props.group.group_id}/`)

const levelOptions = [
  { value: 'read', label: 'read' },
  { value: 'write', label: 'write' },
  { value: 'deny', label: 'deny' },
]

const wellKnownOrder = ['everything', 'group admin', 'metadata', 'data']

function scopeLabel(path: string): string {
  if (!path.startsWith(pathPrefix.value)) return path
  const suffix = path.slice(pathPrefix.value.length)
  switch (suffix) {
    case '**':
      return 'everything'
    case 'admin':
    case 'admin/**':
      return 'group admin'
    case 'meta':
    case 'meta/**':
      return 'metadata'
    case 'data':
    case 'data/**':
      return 'data'
    default:
      return suffix
  }
}

const sortedRoles = computed(() => {
  const rank = (role: ApiRole) => {
    const index = ['admin', 'user', 'viewer'].indexOf(role.name)
    return index === -1 ? 3 : index
  }
  return [...props.group.roles].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
})

const scopes = computed(() => {
  const labels = new Map<string, string[]>()
  for (const role of props.group.roles) {
    for (const path of Object.keys(role.permissions)) {
      const label = scopeLabel(path)
      const paths = labels.get(label) ?? []
      if (!paths.includes(path)) paths.push(path)
      labels.set(label, paths)
    }
  }
  return Array.from(labels.entries())
    .map(([label, paths]) => ({ label, paths }))
    .sort((a, b) => {
      const ra = wellKnownOrder.indexOf(a.label)
      const rb = wellKnownOrder.indexOf(b.label)
      return (ra === -1 ? wellKnownOrder.length : ra) - (rb === -1 ? wellKnownOrder.length : rb) || a.label.localeCompare(b.label)
    })
})

function cellLevel(role: ApiRole, paths: string[]): string | null {
  for (const path of paths) {
    const level = role.permissions[path]
    if (level) return level.toLowerCase()
  }
  return null
}

function levelVariant(level: string) {
  switch (level) {
    case 'write':
      return 'royal'
    case 'deny':
      return 'destructive'
    default:
      return 'secondary'
  }
}

async function addRole() {
  if (!newRoleName.value.trim() || !newPathSuffix.value.trim()) return
  roleError.value = null
  try {
    await createGroupRole(props.group.group_id, {
      name: newRoleName.value.trim(),
      permissions: { [`${pathPrefix.value}${newPathSuffix.value.trim().replace(/^\/+/, '')}`]: newLevel.value },
    })
    newRoleName.value = ''
    newPathSuffix.value = ''
    newLevel.value = 'read'
    emit('changed')
  } catch (err) {
    roleError.value = err instanceof Error ? err.message : String(err)
  }
}

async function removeRole(role: ApiRole) {
  roleError.value = null
  try {
    await deleteGroupRole(props.group.group_id, role.role_id)
    emit('changed')
  } catch (err) {
    roleError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th class="px-5 py-2 text-left font-semibold">Role</th>
            <th v-for="scope in scopes" :key="scope.label" class="px-3 py-2 text-left font-semibold" :title="scope.paths.join('\n')">
              {{ scope.label }}
            </th>
            <th class="px-3 py-2 text-right font-semibold tabular-nums">Assigned</th>
            <th v-if="canManage" class="px-5 py-2 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="role in sortedRoles" :key="role.role_id" class="border-t border-border">
            <td class="px-5 py-2.5 font-medium text-foreground">
              {{ role.name }}
              <Badge v-if="role.public" variant="secondary" class="ml-1 text-[10px] uppercase" title="Applies to everyone, including anonymous requests">public</Badge>
            </td>
            <td v-for="scope in scopes" :key="scope.label" class="px-3 py-2.5">
              <Badge v-if="cellLevel(role, scope.paths)" :variant="levelVariant(cellLevel(role, scope.paths)!)" class="text-[10px] uppercase">
                {{ cellLevel(role, scope.paths) }}
              </Badge>
              <span v-else class="text-muted-foreground">—</span>
            </td>
            <td class="px-3 py-2.5 text-right text-[11px] tabular-nums text-muted-foreground">
              {{ role.assigned_users ? role.assigned_users.length : '—' }}
            </td>
            <td v-if="canManage" class="px-5 py-2.5 text-right">
              <span v-if="role.name === 'admin'" class="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="The admin role cannot be deleted.">
                <Lock class="h-3 w-3" /> protected
              </span>
              <Button v-else variant="ghost" size="sm" :disabled="saving" @click="removeRole(role)">
                <Trash2 class="h-3.5 w-3.5" /> Delete
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="roleError" class="border-t border-border px-5 py-2 text-xs text-destructive">{{ roleError }}</div>

    <div v-if="canManage" class="border-t border-border px-5 py-4">
      <div class="text-xs font-medium text-foreground">Create role</div>
      <div class="mt-2 grid gap-2 sm:grid-cols-[180px_1fr_120px_auto]">
        <Input v-model="newRoleName" placeholder="Role name" />
        <div class="flex items-center gap-0">
          <span class="flex h-9 max-w-[45%] items-center truncate rounded-l-md border border-r-0 border-input bg-muted/40 px-2 font-mono text-[11px] text-muted-foreground" :title="pathPrefix">{{ pathPrefix }}</span>
          <Input v-model="newPathSuffix" class="rounded-l-none" placeholder="data/** or meta/reports/**" />
        </div>
        <Select :model-value="newLevel" :options="levelOptions" @update:model-value="(v: string) => (newLevel = v as GroupPermissionLevel)" />
        <Button :disabled="!newRoleName.trim() || !newPathSuffix.trim() || saving" @click="addRole">
          <Plus class="h-3.5 w-3.5" /> Add role
        </Button>
      </div>
      <p class="mt-1.5 text-[11px] text-muted-foreground">Permission paths must stay inside this group's scope; type only the suffix.</p>
      <button
        type="button"
        class="mt-2 flex items-center gap-1 text-xs font-medium text-foreground/80 hover:text-foreground"
        @click="showPathBrowser = !showPathBrowser"
      >
        <ChevronRight :class="['h-3.5 w-3.5 transition-transform', showPathBrowser && 'rotate-90']" />
        <FolderSearch class="h-3.5 w-3.5" />
        Browse resource paths
      </button>
      <PermissionPathPicker
        v-if="showPathBrowser"
        :group-id="group.group_id"
        :selected="newPathSuffix"
        class="mt-2 max-w-xl"
        @select="(suffix) => (newPathSuffix = suffix)"
      />
    </div>
  </div>
</template>
