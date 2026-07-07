<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import AccessBadge from '@/components/ui/AccessBadge.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import GroupDetail from '@/components/groups/GroupDetail.vue'
import JoinRequestButton from '@/components/groups/JoinRequestButton.vue'
import { useAruna } from '@/composables/useAruna'
import { useRoute } from 'vue-router'
import { computed, ref, watch } from 'vue'
import { Plus, RefreshCw, Users } from '@lucide/vue'

const { currentUser, myGroups, discoverableGroups, loading, refresh } = useAruna()
const route = useRoute()

const createGroupOpen = ref(false)
const selectedGroupId = ref('')

watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string' && id) selectedGroupId.value = id
  },
  { immediate: true },
)

function toggleGroup(groupId: string) {
  selectedGroupId.value = selectedGroupId.value === groupId ? '' : groupId
}

const description = computed(() =>
  currentUser.value
    ? 'Your groups in this realm — manage members, roles and permissions.'
    : 'Groups in this realm. Sign in from the top bar to create and manage groups.',
)
</script>

<template>
  <div>
    <PageHeader title="Groups" :description="description">
      <template #actions>
        <Button variant="outline" @click="refresh"><RefreshCw class="h-4 w-4" /> Refresh</Button>
        <Button :disabled="!currentUser" @click="createGroupOpen = true">
          <Plus class="h-4 w-4" /> Create group
        </Button>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <section class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-border px-5 py-4">
          <div class="flex items-center gap-2">
            <Users class="h-4 w-4 text-primary" />
            <h2 class="font-display text-sm font-semibold text-aruna-navy">Your groups</h2>
            <Badge variant="outline" class="tabular-nums">{{ myGroups.length }}</Badge>
          </div>
        </header>
        <ul class="divide-y divide-border">
          <li v-for="group in myGroups" :key="group.id">
            <button
              type="button"
              class="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40"
              :class="selectedGroupId === group.id ? 'bg-muted/30' : ''"
              @click="toggleGroup(group.id)"
            >
              <span class="h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-foreground">{{ group.name }}</div>
                <div class="truncate font-mono text-[10px] text-muted-foreground">{{ group.id }}</div>
              </div>
              <Badge v-if="group.memberCount !== undefined" variant="outline" class="shrink-0 tabular-nums">
                {{ group.memberCount }} {{ group.memberCount === 1 ? 'member' : 'members' }}
              </Badge>
              <div class="flex flex-wrap justify-end gap-1">
                <AccessBadge v-for="role in group.tags" :key="role" :access="role" />
              </div>
            </button>
            <div v-if="selectedGroupId === group.id" class="border-t border-border bg-muted/10 p-4">
              <GroupDetail :group-id="group.id" @left="selectedGroupId = ''" />
            </div>
          </li>
          <li v-if="!myGroups.length" class="px-5 py-8 text-center text-xs text-muted-foreground">
            <p>
              {{
                loading
                  ? 'Loading groups…'
                  : currentUser
                    ? 'You are not a member of any group yet — create one to get started.'
                    : 'Sign in to see the groups you belong to.'
              }}
            </p>
            <Button v-if="currentUser && !loading" variant="outline" size="sm" class="mt-3" @click="createGroupOpen = true">
              <Plus class="h-3.5 w-3.5" /> Create group
            </Button>
          </li>
        </ul>
      </section>

      <section v-if="discoverableGroups.length" class="surface overflow-hidden">
        <header class="border-b border-border px-5 py-4">
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Other groups in this realm</h2>
          <p class="text-xs text-muted-foreground">Membership is managed by each group's admins.</p>
        </header>
        <ul class="divide-y divide-border">
          <li v-for="group in discoverableGroups" :key="group.id">
            <div class="flex items-center">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40"
                :class="selectedGroupId === group.id ? 'bg-muted/30' : ''"
                @click="toggleGroup(group.id)"
              >
                <span class="h-2 w-2 shrink-0 rounded-full bg-border" />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium text-foreground">{{ group.name }}</div>
                  <div class="truncate font-mono text-[10px] text-muted-foreground">{{ group.id }}</div>
                </div>
              </button>
              <div class="shrink-0 pr-5">
                <JoinRequestButton :group-id="group.id" :group-name="group.name" />
              </div>
            </div>
            <div v-if="selectedGroupId === group.id" class="border-t border-border bg-muted/10 p-4">
              <GroupDetail :group-id="group.id" />
            </div>
          </li>
        </ul>
      </section>
    </div>

    <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => (selectedGroupId = group.group_id)" />
  </div>
</template>
