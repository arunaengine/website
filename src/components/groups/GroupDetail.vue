<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import QuotaBar from '@/components/ui/QuotaBar.vue'
import GroupMembers from '@/components/groups/GroupMembers.vue'
import GroupRoles from '@/components/groups/GroupRoles.vue'
import JoinRequestButton from '@/components/groups/JoinRequestButton.vue'
import JoinRequestsInbox from '@/components/groups/JoinRequestsInbox.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { FileJson2, HardDrive, Inbox, LogOut, ShieldCheck, Users } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useJoinRequests } from '@/composables/useJoinRequests'
import { assessQuota, quotaCountedBytes, QUOTA_STATE_BADGES } from '@/lib/quota'
import { formatBytes, relativeTime } from '@/lib/utils'
import {
  ApiError,
  type GroupDetailResponse,
  type GroupMember,
  type MetadataDocumentListItem,
  type UsageResponse,
} from '@/lib/api'

const props = defineProps<{ groupId: string }>()
const emit = defineEmits<{ (e: 'left'): void }>()

const { getGroup, getGroupUsage, listGroupMembers, listGroupMetadata, leaveGroup, saving, currentUser } = useAruna()
const { joinRequestsEnabled } = useJoinRequests()

const DOC_LIMIT = 8
const joinRequestCount = ref(0)

const group = ref<GroupDetailResponse | null>(null)
const members = ref<GroupMember[]>([])
const membersHidden = ref(false)
const loadError = ref<string | null>(null)
const leaveError = ref<string | null>(null)
const loadingDetail = ref(false)
const usage = ref<UsageResponse | null>(null)
const docs = ref<MetadataDocumentListItem[] | null>(null)
const docsError = ref<string | null>(null)
const docsLoading = ref(false)

const quotaStatus = computed(() => usage.value?.quota ?? null)
// The counter the backend QuotaGate enforces against (realm-wide logical bytes).
const usedBytes = computed(() => (usage.value ? quotaCountedBytes(usage.value) : 0))
const quotaAssessment = computed(() => assessQuota(quotaStatus.value, usedBytes.value))
const quotaBadge = computed(() => QUOTA_STATE_BADGES[quotaAssessment.value.state])

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
  docs.value = null
  docsError.value = null
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
    // Documents are loaded separately: a failure here must not blank the panel.
    docsLoading.value = true
    try {
      docs.value = (await listGroupMetadata(props.groupId)).documents
    } catch (err) {
      docsError.value = err instanceof Error ? err.message : String(err)
    } finally {
      docsLoading.value = false
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
        <JoinRequestButton v-if="group" :group-id="group.group_id" :group-name="group.display_name" />
      </header>
      <div v-if="leaveError" class="border-b border-border px-5 py-2 text-xs text-destructive">{{ leaveError }}</div>

      <div v-if="usage" id="storage" class="scroll-mt-24 border-b border-border">
        <div class="flex items-center gap-2 px-5 pb-1 pt-4">
          <HardDrive class="h-3.5 w-3.5 text-primary" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Storage</span>
          <Badge v-if="quotaBadge" :variant="quotaBadge.variant" class="text-[10px] uppercase">{{ quotaBadge.label }}</Badge>
        </div>
        <div class="px-5 py-3">
          <!-- Old backend: usage but no quota block. Do NOT claim unlimited. -->
          <div v-if="!quotaStatus" class="flex items-center justify-between text-[11px]">
            <span class="font-medium text-muted-foreground">Group storage</span>
            <span class="tabular-nums text-foreground/80">{{ formatBytes(usedBytes) }}</span>
          </div>
          <QuotaBar
            v-else-if="quotaStatus.quota_bytes == null"
            :used="usedBytes"
            :quota="null"
            label="Group storage"
          />
          <QuotaBar
            v-else
            :used="usedBytes"
            :quota="quotaStatus.quota_bytes"
            :ceiling="quotaStatus.ceiling_bytes"
            :warn="quotaStatus.warning"
            label="Group storage"
          />
          <p v-if="quotaStatus && quotaStatus.ceiling_bytes != null" class="mt-1 text-[11px] text-muted-foreground">
            Hard cap {{ formatBytes(quotaStatus.ceiling_bytes) }}.
          </p>
          <p v-if="quotaAssessment.state === 'over-quota'" class="mt-1 text-[11px] text-muted-foreground">
            Writes are accepted until the hard cap; above it the node rejects uploads (QuotaExceeded).
          </p>
          <p v-else-if="quotaAssessment.state === 'over-ceiling'" class="mt-1 text-[11px] text-destructive">
            The node is rejecting uploads for this group (QuotaExceeded). Free storage or ask a realm admin to raise the quota.
          </p>
        </div>
      </div>

      <div class="border-b border-border">
        <div class="flex items-center gap-2 px-5 pb-1 pt-4">
          <FileJson2 class="h-3.5 w-3.5 text-primary" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Documents</span>
          <Badge v-if="docs" variant="outline" class="tabular-nums">{{ docs.length }}</Badge>
        </div>
        <div class="px-5 py-3">
          <p v-if="docsLoading && !docs" class="text-xs text-muted-foreground">Loading documents…</p>
          <p v-else-if="docsError" class="text-xs text-destructive">{{ docsError }}</p>
          <p v-else-if="docs && !docs.length" class="text-xs text-muted-foreground">This group has no metadata documents yet.</p>
          <ul v-else-if="docs" class="space-y-1">
            <li v-for="doc in docs.slice(0, DOC_LIMIT)" :key="doc.document_id">
              <RouterLink :to="{ name: 'metadata-detail', params: { id: doc.document_id } }" class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                <span class="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">{{ doc.document_path }}</span>
                <Badge :variant="doc.public ? 'success' : 'secondary'" class="shrink-0 text-[10px] uppercase">{{ doc.public ? 'public' : 'private' }}</Badge>
                <span class="shrink-0 text-[11px] text-muted-foreground">{{ relativeTime(doc.updated_at) }}</span>
              </RouterLink>
            </li>
          </ul>
          <RouterLink
            v-if="docs && docs.length > DOC_LIMIT"
            :to="{ name: 'search' }"
            class="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
          >
            View all {{ docs.length }} in Discover →
          </RouterLink>
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

      <div v-if="canManage && joinRequestsEnabled" class="border-b border-border">
        <div class="flex items-center gap-2 px-5 pb-1 pt-4">
          <Inbox class="h-3.5 w-3.5 text-primary" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Join requests</span>
          <Badge v-if="joinRequestCount > 0" variant="warn" class="tabular-nums">{{ joinRequestCount }}</Badge>
          <Badge v-else variant="outline" class="tabular-nums">0</Badge>
        </div>
        <JoinRequestsInbox
          :group-id="group.group_id"
          :roles="group.roles"
          @changed="reload"
          @count="joinRequestCount = $event"
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
