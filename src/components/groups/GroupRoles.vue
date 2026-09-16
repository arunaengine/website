<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import RoleBuilder from './RoleBuilder.vue'
import { describeTarget, pathProblem } from './permission-paths'
import { computed, ref } from 'vue'
import { Globe, Info, Lock, Pencil, Plus, Trash2 } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import type { ApiRole, GroupDetailResponse } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{
  group: GroupDetailResponse
  canManage: boolean
}>()

const emit = defineEmits<{ (e: 'changed'): void }>()

const { deleteGroupRole, saving } = useAruna()

const roleError = ref<string | null>(null)
// null = builder closed; { role: null } = create; { role } = edit.
const editor = ref<{ role: ApiRole | null; isPublic?: boolean } | null>(null)

// Built-in role names the create API rejects, so edit-as-recreate cannot work.
const BUILTIN_NAMES = ['admin', 'user']

const pathPrefix = computed(() => `/${props.group.realm_id}/g/${props.group.group_id}/`)

const wellKnownOrder = ['everything', 'group admin', 'metadata', 'data']

// The four broad scopes get a column each; every narrower path is a custom
// rule listed under one column, so the table never scrolls sideways.
function scopeLabel(path: string): string | null {
  if (!path.startsWith(pathPrefix.value)) return null
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
      return null
  }
}

function customRules(role: ApiRole): { path: string; label: string; level: string }[] {
  return Object.entries(role.permissions)
    .filter(([path]) => scopeLabel(path) === null)
    .map(([path, level]) => {
      const suffix = path.startsWith(pathPrefix.value) ? path.slice(pathPrefix.value.length) : path
      return { path, label: pathProblem(suffix) ? suffix : describeTarget(suffix), level: level.toLowerCase() }
    })
}

const anyCustom = computed(() => props.group.roles.some((role) => customRules(role).length > 0))

// The column shows the widest level the custom rules grant; the modal names each path.
function customSummary(role: ApiRole): { level: string; count: number } {
  const rules = customRules(role)
  const levels = new Set(rules.map((rule) => rule.level))
  return { level: levels.has('write') ? 'write' : levels.has('read') ? 'read' : 'deny', count: rules.length }
}

const rulesOf = ref<ApiRole | null>(null)

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
      if (!label) continue
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

function closeEditor(changed: boolean) {
  editor.value = null
  if (changed) emit('changed')
}

async function removeRole(role: ApiRole) {
  roleError.value = null
  try {
    await deleteGroupRole(props.group.group_id, role.role_id)
    emit('changed')
  } catch (err) {
    roleError.value = errorMessage(err)
  }
}
</script>

<template>
  <div>
    <p class="border-b border-border px-5 py-3 text-xs text-muted-foreground">
      Roles decide what members can reach: each role is a set of access rules, an access level on part of
      this group, and is assigned to members in the Members tab.
    </p>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th class="px-5 py-2 text-left font-semibold">Role</th>
            <th v-for="scope in scopes" :key="scope.label" class="px-3 py-2 text-left font-semibold" :title="scope.paths.join('\n')">
              {{ scope.label }}
            </th>
            <th v-if="anyCustom" class="px-3 py-2 text-left font-semibold">Custom</th>
            <th class="px-3 py-2 text-right font-semibold tabular-nums">Assigned</th>
            <th v-if="canManage" class="px-5 py-2 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="role in sortedRoles" :key="role.role_id" class="border-t border-border">
            <td class="px-5 py-2.5 font-medium text-foreground">
              {{ role.name }}
              <Badge v-if="role.public" size="sm" variant="success" class="ml-1 uppercase" title="Applies to everyone, including anonymous requests">
                <Globe class="mr-0.5 h-3 w-3" aria-hidden="true" /> public
              </Badge>
            </td>
            <td v-for="scope in scopes" :key="scope.label" class="px-3 py-2.5">
              <Badge v-if="cellLevel(role, scope.paths)" size="sm" :variant="levelVariant(cellLevel(role, scope.paths)!)" class="uppercase">
                {{ cellLevel(role, scope.paths) }}
              </Badge>
              <span v-else class="text-muted-foreground">-</span>
            </td>
            <td v-if="anyCustom" class="px-3 py-2.5">
              <button
                v-if="customRules(role).length"
                type="button"
                class="inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-muted"
                :aria-label="`Show the custom rules of ${role.name}`"
                @click="rulesOf = role"
              >
                <Badge size="sm" :variant="levelVariant(customSummary(role).level)" class="uppercase">{{ customSummary(role).level }}</Badge>
                <span class="text-[11px] text-muted-foreground">{{ customSummary(role).count }} {{ customSummary(role).count === 1 ? 'rule' : 'rules' }}</span>
                <Info class="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              </button>
              <span v-else class="text-muted-foreground">-</span>
            </td>
            <td class="px-3 py-2.5 text-right text-[11px] tabular-nums text-muted-foreground">
              {{ role.public ? 'everyone' : role.assigned_users ? role.assigned_users.length : '-' }}
            </td>
            <td v-if="canManage" class="px-5 py-2.5 text-right">
              <span v-if="role.name === 'admin'" class="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="The admin role cannot be changed or deleted.">
                <Lock class="h-3 w-3" /> protected
              </span>
              <template v-else>
                <Button
                  v-if="!BUILTIN_NAMES.includes(role.name)"
                  variant="ghost"
                  size="icon-sm"
                  class="text-muted-foreground"
                  :aria-label="`Edit role ${role.name}`"
                  :disabled="saving"
                  @click="editor = { role }"
                >
                  <Pencil class="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-muted-foreground"
                  :aria-label="`Delete role ${role.name}`"
                  :disabled="saving"
                  @click="removeRole(role)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </Button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="roleError" class="border-t border-border px-5 py-2 text-xs text-destructive">{{ roleError }}</div>

    <Dialog :open="rulesOf !== null" @update:open="(value: boolean) => { if (!value) rulesOf = null }">
      <DialogContent v-if="rulesOf" class="max-w-lg">
        <DialogHeader>
          <DialogTitle>Custom rules of "{{ rulesOf.name }}"</DialogTitle>
          <DialogDescription>Access rules on parts of this group, beside the broad scopes in the table.</DialogDescription>
        </DialogHeader>
        <ul class="divide-y divide-border/60 rounded-md border border-border/60 text-xs">
          <li v-for="rule in customRules(rulesOf)" :key="rule.path" class="flex items-start gap-2 px-3 py-2">
            <Badge size="sm" :variant="levelVariant(rule.level)" class="mt-0.5 shrink-0 uppercase">{{ rule.level }}</Badge>
            <span class="min-w-0">
              <span class="block">{{ rule.label }}</span>
              <span class="block break-all font-mono text-[10px] text-muted-foreground">{{ rule.path }}</span>
            </span>
          </li>
        </ul>
      </DialogContent>
    </Dialog>

    <div v-if="canManage" class="border-t border-border">
      <div v-if="!editor" class="flex flex-wrap items-center gap-2 px-5 py-4">
        <Button variant="outline" size="sm" @click="editor = { role: null }">
          <Plus class="h-3.5 w-3.5" /> New role
        </Button>
        <Button variant="outline" size="sm" title="A role everyone holds, signed in or not; it can only view" @click="editor = { role: null, isPublic: true }">
          <Globe class="h-3.5 w-3.5" /> New public role
        </Button>
      </div>
      <RoleBuilder
        v-else
        :key="editor.role?.role_id ?? (editor.isPublic ? 'new-public' : 'new')"
        :group="group"
        :role="editor.role"
        :initial-public="editor.isPublic"
        @saved="closeEditor(true)"
        @cancel="closeEditor(true)"
      />
    </div>
  </div>
</template>
