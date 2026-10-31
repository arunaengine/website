<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconTile from '@/components/ui/IconTile.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import StatusMark from '@/components/ui/StatusMark.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import ViewToggle from '@/components/ui/ViewToggle.vue'
import GroupQuotaCards from '@/components/dashboard/GroupQuotaCards.vue'
import ListSkeleton from '@/components/ui/ListSkeleton.vue'
import SectionSkeleton from '@/components/ui/SectionSkeleton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import GroupDetail from '@/components/groups/GroupDetail.vue'
import JoinRequestButton from '@/components/groups/JoinRequestButton.vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useJoinRequests } from '@/composables/useJoinRequests'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { reloadGroups } from '@/composables/useGroupSelection'
import { useRefresh } from '@/composables/useRefresh'
import { useViewMode } from '@/composables/useViewMode'
import { useFirstPaint } from '@/composables/useFirstPaint'
import { providePageContext } from '@/composables/usePageContext'
import type { PageContext } from '@/lib/assistant/prompt'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Clock, Globe, Inbox, Plus, Users, X } from '@lucide/vue'
import { errorMessage, relativeTime } from '@/lib/utils'
import type { JoinRequest } from '@/lib/api'

const { currentUser, myGroups, discoverableGroups, loading, bootstrapped, refresh, sessionEpoch } = useAruna()
const { authPending } = useAuth()
const {
  joinRequestsEnabled,
  ownRequests,
  visibleOwnRequests,
  ownRequestsLoaded,
  ownRequestsError,
  ensureOwnRequestsLoaded,
  loadOwnRequests,
  withdrawRequest,
  busy,
} = useJoinRequests()

// The memberships, the realm's groups and the join requests paint together.
const painted = useFirstPaint(() =>
  bootstrapped.value && !loading.value && !authPending.value
  && (!joinRequestsEnabled.value || !currentUser.value || ownRequestsLoaded.value || Boolean(ownRequestsError.value)))
const route = useRoute()
const router = useRouter()

const groupQuery = ref('')
const matchingGroups = computed(() => {
  const query = groupQuery.value.trim().toLowerCase()
  return discoverableGroups.value.filter((group) => `${group.name} ${group.id}`.toLowerCase().includes(query))
})
const createGroupOpen = ref(false)
// The top bar's Create menu opens the dialog with ?create=group; the marker goes once read.
watch(
  () => route.query.create,
  (create) => {
    if (create !== 'group') return
    createGroupOpen.value = true
    const { create: _create, ...rest } = route.query
    void router.replace({ query: rest })
  },
  { immediate: true },
)
const selectedGroupId = ref('')
async function refreshGroups() {
  await Promise.all([
    refresh(),
    joinRequestsEnabled.value && currentUser.value ? loadOwnRequests() : Promise.resolve(),
  ])
}
const groupView = useViewMode('groups')
// A refresh also reloads the group cards' usage.
const cardsRevision = ref(0)
const { busy: refreshBusy, refresh: onRefresh } = useRefresh(async () => {
  cardsRevision.value++
  await refreshGroups()
})
function onDeleted() {
  void router.push({ name: 'groups' })
  void refreshGroups()
}
const spinning = computed(() => refreshBusy.value || loading.value)

async function loadOwnJoinRequests() {
  if (!joinRequestsEnabled.value || !currentUser.value) return
  await ensureOwnRequestsLoaded()
  // The section only renders once the async fetch resolves, so the router's
  // one-shot hash retry misses it; scroll here after the section is in the DOM.
  if (route.hash === '#join-requests') {
    await nextTick()
    document.getElementById('join-requests')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
onMounted(loadOwnJoinRequests)
// A group created in another tab must show up here without a page reload.
onMounted(reloadGroups)
// A post-mount sign-in must also load the requests.
watch(currentUser, loadOwnJoinRequests)


// Prefer a name the portal already knows; fall back to the echoed name, then id.
function groupNameFor(req: JoinRequest): string {
  const known =
    myGroups.value.find((g) => g.id === req.group_id) ??
    discoverableGroups.value.find((g) => g.id === req.group_id)
  return known?.name ?? req.group_display_name ?? req.group_id
}

// The request whose withdrawal is on its way, and the click that owns that wait.
const withdrawing = ref<string | null>(null)
let withdrawRun = 0
watch(sessionEpoch, () => {
  withdrawing.value = null
  withdrawRun++
})

async function withdraw(req: JoinRequest) {
  if (withdrawing.value) return
  const run = ++withdrawRun
  withdrawing.value = req.request_id
  try {
    await withdrawRequest(req)
  } catch (err) {
    if (run === withdrawRun) reportGlobalError(errorMessage(err))
  } finally {
    if (run === withdrawRun) withdrawing.value = null
  }
}

watch(
  () => route.params.id,
  (id) => {
    selectedGroupId.value = typeof id === 'string' ? id : ''
  },
  { immediate: true },
)


const selectedGroup = computed(() =>
  [...myGroups.value, ...discoverableGroups.value].find((group) => group.id === selectedGroupId.value),
)

providePageContext((): PageContext => (selectedGroupId.value
  ? { kind: 'group', title: selectedGroup.value?.name ?? selectedGroupId.value, details: { id: selectedGroupId.value } }
  : { kind: 'groups page', title: 'Groups', details: { 'groups joined': String(myGroups.value.length) } }))


const emptyGroupsMessage = computed(() =>
  currentUser.value
    ? 'You are not a member of any group yet, create one to get started.'
    : 'Sign in to see the groups you belong to.',
)

</script>

<template>
  <div>
    <!-- The group waits for the session, so its rights and lists read for the signed-in user. -->
    <div v-if="selectedGroupId && !painted" class="w-full px-4 py-6 sm:px-6">
      <SectionSkeleton :lines="4" />
    </div>
    <GroupDetail
      v-else-if="selectedGroupId"
      :key="`${sessionEpoch}/${selectedGroupId}`"
      :group-id="selectedGroupId"
      :name="selectedGroup?.name"
      @left="router.push({ name: 'groups' })"
      @deleted="onDeleted"
    />

    <template v-else>
      <PageHeader title="Groups" :docs="{ topic: 'first-group', section: 'Groups own your work' }">
        <template #actions>
          <RefreshButton :busy="spinning" @click="onRefresh" />
          <Button size="sm" data-tour="groups-create" :disabled="!currentUser" @click="createGroupOpen = true">
            <Plus class="h-4 w-4" /> Create group
          </Button>
        </template>
      </PageHeader>

      <div v-if="!painted" class="w-full space-y-8 px-4 py-6 sm:px-6">
        <ListSkeleton header :rows="3" label="Loading groups" />
        <SectionSkeleton :lines="2" />
      </div>

      <div v-else class="w-full space-y-8 px-4 py-6 sm:px-6">
        <section data-tour="groups-yours" aria-labelledby="your-groups-heading">
          <SectionHeading id="your-groups-heading" title="Your groups" :icon="Users" info="A bucket stored on several nodes counts once.">
            <template v-if="myGroups.length" #actions>
              <ViewToggle v-model="groupView" />
            </template>
          </SectionHeading>
          <GroupQuotaCards v-if="myGroups.length" :refresh-revision="cardsRevision" :view="groupView" members />
          <EmptyState v-else :title="emptyGroupsMessage">
            <template #icon><Users class="size-6" /></template>
            <Button v-if="currentUser" variant="outline" size="sm" @click="createGroupOpen = true">
              <Plus class="h-3.5 w-3.5" /> Create group
            </Button>
          </EmptyState>
        </section>

        <section
          v-if="joinRequestsEnabled && currentUser && (visibleOwnRequests.length || ownRequestsError)"
          id="join-requests"
          class="scroll-mt-20"
          aria-labelledby="join-requests-heading"
        >
          <SectionHeading id="join-requests-heading" title="Your join requests" :icon="Inbox" />
          <div class="surface overflow-hidden">
            <p v-if="ownRequestsError" class="px-5 py-3 text-xs text-destructive">{{ ownRequestsError }}</p>
            <ul v-if="visibleOwnRequests.length" class="divide-y divide-border-subtle">
              <li v-for="req in visibleOwnRequests" :key="req.request_id" class="flex flex-wrap items-center gap-3 px-5 py-3">
                <IconTile :icon="Users" tone="muted" size="sm" />
                <div class="min-w-0 flex-1">
                  <RouterLink :to="{ name: 'group', params: { id: req.group_id } }" class="block truncate text-sm font-medium text-foreground hover:underline">
                    {{ groupNameFor(req) }}
                  </RouterLink>
                  <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span class="inline-flex items-center gap-1.5"><Clock class="size-3.5" />Sent {{ relativeTime(req.created_at) }}</span>
                    <span v-if="req.status === 'denied' && req.decision_reason">{{ req.decision_reason }}</span>
                  </p>
                </div>
                <StatusPill v-if="req.status === 'pending'" state="Pending" tone="attention" :icon="Clock" />
                <StatusMark v-else-if="req.status === 'approved'" label="Approved" />
                <StatusPill v-else state="Denied" tone="failed" />
                <Button
                  v-if="req.status === 'pending'"
                  variant="outline"
                  size="sm"
                  class="shrink-0"
                  :disabled="busy || withdrawing !== null"
                  :aria-busy="withdrawing === req.request_id"
                  @click="withdraw(req)"
                >
                  <Spinner v-if="withdrawing === req.request_id" label="Withdrawing the request" class="text-current" /><X v-else class="h-3.5 w-3.5" /> Withdraw
                </Button>
              </li>
            </ul>
          </div>
        </section>

        <section v-if="discoverableGroups.length" aria-labelledby="other-groups-heading">
          <SectionHeading id="other-groups-heading" title="Other groups" :icon="Globe" info="Groups in this realm you are not in. Request access from their admins.">
            <template #actions>
              <Input v-model="groupQuery" class="h-8 w-full sm:w-64" placeholder="Find a group" aria-label="Search other groups" />
            </template>
          </SectionHeading>
          <div class="surface overflow-hidden">
            <p v-if="!matchingGroups.length" class="px-5 py-4 text-sm text-muted-foreground">No groups match your search.</p>
            <ul v-else class="divide-y divide-border-subtle">
              <li v-for="group in matchingGroups" :key="group.id" class="flex items-center gap-3 px-5 py-3">
                <RouterLink :to="{ name: 'group', params: { id: group.id } }" class="flex min-w-0 flex-1 items-center gap-3 hover:underline">
                  <IconTile :icon="Users" tone="muted" size="sm" />
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium text-foreground">{{ group.name }}</span>
                    <span class="block truncate font-mono text-xs text-muted-foreground">{{ group.id }}</span>
                  </span>
                </RouterLink>
                <JoinRequestButton v-if="joinRequestsEnabled" :group-id="group.id" :group-name="group.name" />
              </li>
            </ul>
          </div>
        </section>
      </div>
    </template>

    <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => router.push({ name: 'group', params: { id: group.group_id } })" />
  </div>
</template>
