<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import AccessBadge from '@/components/ui/AccessBadge.vue'
import { computed, ref, watch } from 'vue'
import { ShieldCheck, UserMinus, UserPlus, X } from 'lucide-vue-next'
import { useDebounceFn } from '@vueuse/core'
import { useAruna } from '@/composables/useAruna'
import type { ApiRole, GroupMember, UserSearchHit } from '@/lib/api'

const props = defineProps<{
  groupId: string
  members: GroupMember[]
  roles: ApiRole[]
  canManage: boolean
}>()

const emit = defineEmits<{ (e: 'changed'): void }>()

const { addGroupMember, removeGroupMember, searchUsers, saving, currentUser } = useAruna()

const memberError = ref<string | null>(null)
const query = ref('')
const results = ref<UserSearchHit[]>([])
const searching = ref(false)
const searchError = ref<string | null>(null)
const selectedUser = ref<UserSearchHit | null>(null)
const selectedRoleId = ref('')

const roleOptions = computed(() =>
  props.roles.map((role) => ({ value: role.role_id, label: role.name })),
)
const memberIds = computed(() => new Set(props.members.map((member) => member.user_id)))
const visibleResults = computed(() =>
  results.value.filter((hit) => !memberIds.value.has(hit.user_id)),
)

watch(
  () => props.roles,
  (roles) => {
    if (!selectedRoleId.value || !roles.some((role) => role.role_id === selectedRoleId.value)) {
      selectedRoleId.value = roles.find((role) => role.name === 'user')?.role_id ?? ''
    }
  },
  { immediate: true },
)

const runSearch = useDebounceFn(async (term: string) => {
  if (term.length < 2) {
    results.value = []
    return
  }
  searching.value = true
  searchError.value = null
  try {
    const response = await searchUsers(term)
    results.value = response.users
  } catch (err) {
    searchError.value = err instanceof Error ? err.message : String(err)
    results.value = []
  } finally {
    searching.value = false
  }
}, 250)

watch(query, (term) => {
  if (selectedUser.value && term.trim() === selectedUser.value.name) return
  selectedUser.value = null
  void runSearch(term.trim())
})

function isAdmin(member: GroupMember): boolean {
  return member.roles.some((role) => role.name === 'admin')
}

async function addMember() {
  if (!selectedUser.value) return
  memberError.value = null
  try {
    await addGroupMember(props.groupId, {
      user_id: selectedUser.value.user_id,
      ...(selectedRoleId.value ? { role_ids: [selectedRoleId.value] } : {}),
    })
    query.value = ''
    results.value = []
    selectedUser.value = null
    emit('changed')
  } catch (err) {
    memberError.value = err instanceof Error ? err.message : String(err)
  }
}

async function removeMember(member: GroupMember, roleId?: string) {
  memberError.value = null
  try {
    await removeGroupMember(props.groupId, member.user_id, roleId)
    emit('changed')
  } catch (err) {
    memberError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <div>
    <table class="w-full text-sm">
      <thead class="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
        <tr>
          <th class="px-5 py-2 text-left font-semibold">Member</th>
          <th class="px-5 py-2 text-left font-semibold">Roles</th>
          <th v-if="canManage" class="px-5 py-2 text-right font-semibold">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="member in members" :key="member.user_id" class="border-t border-border" :class="isAdmin(member) ? 'bg-primary/[0.03]' : ''">
          <td class="px-5 py-2.5">
            <div class="flex items-center gap-2">
              <ShieldCheck v-if="isAdmin(member)" class="h-3.5 w-3.5 shrink-0 text-primary" />
              <div class="min-w-0">
                <div class="truncate text-sm font-medium text-foreground">
                  {{ member.name ?? member.user_id }}
                  <span v-if="member.user_id === currentUser?.id" class="text-[11px] font-normal text-muted-foreground">(you)</span>
                </div>
                <div v-if="member.name" class="truncate font-mono text-[10px] text-muted-foreground">{{ member.user_id }}</div>
              </div>
            </div>
          </td>
          <td class="px-5 py-2.5">
            <div class="flex flex-wrap gap-1">
              <span v-for="role in member.roles" :key="role.role_id" class="inline-flex items-center gap-0.5">
                <AccessBadge :access="role.name" />
                <button
                  v-if="canManage"
                  type="button"
                  class="rounded-sm p-0.5 text-muted-foreground opacity-60 transition-opacity hover:opacity-100"
                  :title="`Revoke ${role.name}`"
                  :disabled="saving"
                  @click="removeMember(member, role.role_id)"
                >
                  <X class="h-3 w-3" />
                </button>
              </span>
            </div>
          </td>
          <td v-if="canManage" class="px-5 py-2.5 text-right">
            <Button variant="ghost" size="sm" :disabled="saving" @click="removeMember(member)">
              <UserMinus class="h-3.5 w-3.5" /> Remove
            </Button>
          </td>
        </tr>
        <tr v-if="!members.length">
          <td :colspan="canManage ? 3 : 2" class="px-5 py-6 text-center text-xs text-muted-foreground">No members.</td>
        </tr>
      </tbody>
    </table>

    <div v-if="memberError" class="border-t border-border px-5 py-2 text-xs text-destructive">{{ memberError }}</div>

    <div v-if="canManage" class="border-t border-border px-5 py-4">
      <div class="text-xs font-medium text-foreground">Add member</div>
      <div class="mt-2 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
        <div class="relative">
          <Input v-model="query" placeholder="Search users (min 2 characters)" />
          <div v-if="query.trim().length >= 2 && !selectedUser" class="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
            <div v-if="searching" class="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
            <div v-else-if="searchError" class="px-3 py-2 text-xs text-destructive">{{ searchError }}</div>
            <div v-else-if="!visibleResults.length" class="px-3 py-2 text-xs text-muted-foreground">No matching users.</div>
            <button
              v-for="hit in visibleResults"
              :key="hit.user_id"
              type="button"
              class="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
              @click="selectedUser = hit; query = hit.name"
            >
              <span class="truncate text-foreground">{{ hit.name }}</span>
              <span class="shrink-0 font-mono text-[10px] text-muted-foreground">{{ hit.user_id.slice(0, 8) }}</span>
            </button>
          </div>
        </div>
        <Select v-model="selectedRoleId" :options="roleOptions" placeholder="Role" />
        <Button :disabled="!selectedUser || saving" @click="addMember">
          <UserPlus class="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      <div v-if="selectedUser" class="mt-1.5 text-[11px] text-muted-foreground">
        Adding <span class="font-medium text-foreground">{{ selectedUser.name }}</span>
        <span class="font-mono">({{ selectedUser.user_id }})</span>
      </div>
    </div>
  </div>
</template>
