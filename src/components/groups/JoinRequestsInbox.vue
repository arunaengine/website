<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import { ref, watch } from 'vue'
import { Check, X } from '@lucide/vue'
import { useJoinRequests } from '@/composables/useJoinRequests'
import { relativeTime } from '@/lib/utils'
import type { ApiRole, JoinRequest } from '@/lib/api'

const props = defineProps<{ groupId: string; roles: ApiRole[] }>()
const emit = defineEmits<{ (e: 'changed'): void; (e: 'count', n: number): void }>()

const { listGroupJoinRequests, decideJoinRequest, busy } = useJoinRequests()

const requests = ref<JoinRequest[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const decideError = ref<string | null>(null)
// One row's decision editor open at a time.
const expandedId = ref('')
const mode = ref<'approve' | 'deny'>('approve')
const selectedRoleIds = ref<string[]>([])
const denyReason = ref('')

function setCount() {
  emit('count', requests.value.length)
}

async function reload() {
  loading.value = true
  loadError.value = null
  try {
    requests.value = await listGroupJoinRequests(props.groupId)
    setCount()
  } catch (err) {
    // A 404 here means a backend without aruna#248 yet — render it inline.
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

watch(() => props.groupId, reload, { immediate: true })

function startApprove(req: JoinRequest) {
  decideError.value = null
  expandedId.value = req.request_id
  mode.value = 'approve'
  // Default to the group's single "user" role, mirroring add_group_member.
  const userRole = props.roles.find((r) => r.name === 'user')
  selectedRoleIds.value = userRole ? [userRole.role_id] : []
}

function startDeny(req: JoinRequest) {
  decideError.value = null
  expandedId.value = req.request_id
  mode.value = 'deny'
  denyReason.value = ''
}

function cancel() {
  expandedId.value = ''
}

function toggleRole(roleId: string) {
  selectedRoleIds.value = selectedRoleIds.value.includes(roleId)
    ? selectedRoleIds.value.filter((id) => id !== roleId)
    : [...selectedRoleIds.value, roleId]
}

async function confirm(req: JoinRequest) {
  decideError.value = null
  const input =
    mode.value === 'approve'
      ? { approve: true, role_ids: selectedRoleIds.value }
      : { approve: false, ...(denyReason.value.trim() ? { reason: denyReason.value.trim() } : {}) }
  try {
    await decideJoinRequest(props.groupId, req.request_id, input)
    requests.value = requests.value.filter((r) => r.request_id !== req.request_id)
    expandedId.value = ''
    setCount()
    emit('changed')
  } catch (err) {
    decideError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <div class="px-5 py-3">
    <p v-if="loading && !requests.length" class="text-xs text-muted-foreground">Loading join requests…</p>
    <p v-else-if="loadError" class="text-xs text-destructive">{{ loadError }}</p>
    <p v-else-if="!requests.length" class="text-xs text-muted-foreground">No pending join requests.</p>
    <ul v-else class="space-y-1">
      <li v-for="req in requests" :key="req.request_id" class="rounded-md border border-border">
        <div class="flex flex-wrap items-center gap-3 px-3 py-2">
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium text-foreground">{{ req.user_name ?? req.user_id }}</div>
            <div v-if="req.user_name" class="truncate font-mono text-[10px] text-muted-foreground">
              {{ req.user_id.slice(0, 8) }}
            </div>
            <p v-if="req.message" class="mt-0.5 text-xs italic text-muted-foreground">"{{ req.message }}"</p>
          </div>
          <span class="shrink-0 text-[11px] text-muted-foreground">{{ relativeTime(req.created_at) }}</span>
          <div class="flex shrink-0 items-center gap-1.5">
            <Button size="sm" :disabled="busy" @click="startApprove(req)">
              <Check class="h-3.5 w-3.5" /> Approve
            </Button>
            <Button variant="outline" size="sm" :disabled="busy" @click="startDeny(req)">
              <X class="h-3.5 w-3.5" /> Deny
            </Button>
          </div>
        </div>

        <div v-if="expandedId === req.request_id" class="border-t border-border bg-muted/20 px-3 py-3">
          <template v-if="mode === 'approve'">
            <div class="text-xs font-medium text-foreground">Assign roles</div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="role in props.roles"
                :key="role.role_id"
                type="button"
                @click="toggleRole(role.role_id)"
              >
                <Badge :variant="selectedRoleIds.includes(role.role_id) ? 'default' : 'outline'" class="cursor-pointer">
                  {{ role.name }}
                </Badge>
              </button>
            </div>
            <p v-if="!selectedRoleIds.length" class="mt-1.5 text-[11px] text-muted-foreground">
              Select at least one role to assign on approval.
            </p>
            <div class="mt-3 flex items-center gap-2">
              <Button size="sm" :disabled="busy || !selectedRoleIds.length" @click="confirm(req)">
                Approve &amp; assign roles
              </Button>
              <Button variant="ghost" size="sm" :disabled="busy" @click="cancel">Cancel</Button>
            </div>
          </template>
          <template v-else>
            <label class="text-xs font-medium text-foreground">Reason (optional, shown to the requester)</label>
            <Input v-model="denyReason" class="mt-1" placeholder="Why is this request declined?" />
            <div class="mt-3 flex items-center gap-2">
              <Button variant="outline" size="sm" class="text-destructive" :disabled="busy" @click="confirm(req)">
                Deny request
              </Button>
              <Button variant="ghost" size="sm" :disabled="busy" @click="cancel">Cancel</Button>
            </div>
          </template>
          <p v-if="decideError" class="mt-2 text-xs text-destructive">{{ decideError }}</p>
        </div>
      </li>
    </ul>
  </div>
</template>
