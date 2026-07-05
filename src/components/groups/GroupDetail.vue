<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import QuotaBar from '@/components/ui/QuotaBar.vue'
import GroupMembers from '@/components/groups/GroupMembers.vue'
import GroupRoles from '@/components/groups/GroupRoles.vue'
import { computed, ref, watch } from 'vue'
import { HardDrive, LogOut, ShieldCheck, Users } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { formatBytes } from '@/lib/utils'
import { ApiError, type GroupDetailResponse, type GroupMember, type UsageResponse } from '@/lib/api'

const props = defineProps<{ groupId: string }>()
const emit = defineEmits<{ (e: 'left'): void }>()

const { getGroup, getGroupUsage, listGroupMembers, leaveGroup, saving, currentUser } = useAruna()

const group = ref<GroupDetailResponse | null>(null)
const members = ref<GroupMember[]>([])
const membersHidden = ref(false)
const loadError = ref<string | null>(null)
const leaveError = ref<string | null>(null)
const loadingDetail = ref(false)
const usage = ref<UsageResponse | null>(null)

const usageTotals = computed(() => usage.value?.realm ?? null)
const quotaStatus = computed(() => usage.value?.quota ?? null)
// Finite quota (a number, not null) means a bar; null means unlimited or no quota block.
const quotaBytes = computed<number | null>(() => {
  const q = quotaStatus.value
  return q && q.quota_bytes != null ? q.quota_bytes : null
})

const isMember = computed(() =>
  Boolean(group.value?.roles.some((role) => role.assigned_users?.includes(currentUser.value?.id ?? ''))),
)
const canManage = computed(() =>
  Boolean(
    group.value?.roles.some(
      (role) => role.name === 'admin' && role.assigned_users?.includes(currentUser.value?.id ?? ''),
    ),
  ),
)

async function reload() {
  loadingDetail.value = true
  loadError.value = null
  usage.value = null
  try {
    group.value = await getGroup(props.groupId)
    // Old backends have no per-group usage endpoint; a 404 just hides the block.
    usage.value = await getGroupUsage(props.groupId).catch(() => null)
    try {
      members.value = (await listGroupMembers(props.groupId)).members
      membersHidden.value = false
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        members.value = []
        membersHidden.value = true
      } else {
        throw err
      }
    }
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
    group.value = null
  } finally {
    loadingDetail.value = false
  }
}

watch(() => props.groupId, () => { leaveError.value = null; void reload() }, { immediate: true })

async function leave() {
  leaveError.value = null
  try {
    await leaveGroup(props.groupId)
    emit('left')
  } catch (err) {
    leaveError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <div class="rounded-lg border border-border bg-background/60">
    <div v-if="loadingDetail && !group" class="px-5 py-6 text-center text-xs text-muted-foreground">Loading group…</div>
    <div v-else-if="loadError" class="px-5 py-6 text-center text-xs text-destructive">{{ loadError }}</div>
    <template v-else-if="group">
      <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h4 class="truncate text-sm font-semibold text-foreground">{{ group.display_name }}</h4>
            <Badge v-if="canManage" variant="royal" class="text-[10px] uppercase"><ShieldCheck class="mr-0.5 h-3 w-3" /> admin</Badge>
            <Badge v-else-if="isMember" variant="secondary" class="text-[10px] uppercase">member</Badge>
          </div>
          <div class="truncate font-mono text-[10px] text-muted-foreground">{{ group.group_id }}</div>
        </div>
        <Button v-if="isMember" variant="outline" size="sm" :disabled="saving" @click="leave">
          <LogOut class="h-3.5 w-3.5" /> Leave group
        </Button>
      </header>
      <div v-if="leaveError" class="border-b border-border px-5 py-2 text-xs text-destructive">{{ leaveError }}</div>

      <div v-if="usageTotals" class="border-b border-border">
        <div class="flex items-center gap-2 px-5 pb-1 pt-4">
          <HardDrive class="h-3.5 w-3.5 text-primary" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Storage</span>
          <Badge v-if="quotaStatus?.warning" variant="warn" class="text-[10px] uppercase">near quota</Badge>
        </div>
        <div class="px-5 py-3">
          <QuotaBar v-if="quotaBytes != null" :used="usageTotals.logical_bytes" :quota="quotaBytes" label="Group storage" />
          <div v-else class="flex items-center justify-between text-[11px]">
            <span class="font-medium text-muted-foreground">Group storage</span>
            <span class="tabular-nums text-foreground/80">{{ formatBytes(usageTotals.logical_bytes) }} <span v-if="quotaStatus" class="text-muted-foreground">· unlimited</span></span>
          </div>
          <p v-if="quotaBytes != null && quotaStatus?.ceiling_bytes != null" class="mt-1 text-[11px] text-muted-foreground">
            Hard cap {{ formatBytes(quotaStatus.ceiling_bytes) }}.
          </p>
        </div>
      </div>

      <div class="border-b border-border">
        <div class="flex items-center gap-2 px-5 pb-1 pt-4">
          <Users class="h-3.5 w-3.5 text-primary" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Members</span>
          <Badge v-if="!membersHidden" variant="outline" class="tabular-nums">{{ members.length }}</Badge>
        </div>
        <div v-if="membersHidden" class="px-5 py-4 text-xs text-muted-foreground">
          The member list is only visible to group members.
        </div>
        <GroupMembers
          v-else
          :group-id="group.group_id"
          :members="members"
          :roles="group.roles"
          :can-manage="canManage"
          @changed="reload"
        />
      </div>

      <div>
        <div class="flex items-center gap-2 px-5 pb-1 pt-4">
          <ShieldCheck class="h-3.5 w-3.5 text-primary" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Roles &amp; permissions</span>
          <Badge variant="outline" class="tabular-nums">{{ group.roles.length }}</Badge>
        </div>
        <GroupRoles :group="group" :can-manage="canManage" @changed="reload" />
      </div>
    </template>
  </div>
</template>
