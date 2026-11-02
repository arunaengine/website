<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconTile from '@/components/ui/IconTile.vue'
import Notice from '@/components/ui/Notice.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import AskAiButton from '@/components/assistant/AskAiButton.vue'
import { useAruna, colorFor, initials } from '@/composables/useAruna'
import { useUserDirectory } from '@/composables/useUserDirectory'
import { shortUserId } from '@/lib/utils'
import type { GetUserResponse } from '@/lib/api'
import { Building2, ChevronRight, ExternalLink, Mail, Pencil, RefreshCw, ShieldCheck, UserRound, Users } from '@lucide/vue'

const route = useRoute()
const { currentUser, sessionEpoch, apiGroups, canInspectUsers } = useAruna()
const { resolveUser, resolveUsers, cachedUser } = useUserDirectory()

const userId = computed(() => (route.params.id as string) || '')
const user = ref<GetUserResponse | null>(null)
const loading = ref(false)
const failed = ref(false)

async function load(id: string, force = false) {
  const epoch = sessionEpoch.value
  loading.value = true
  failed.value = false
  user.value = null
  const resolved = await resolveUser(id, { force })
  // Only apply if the route hasn't moved on meanwhile.
  if (userId.value === id && epoch === sessionEpoch.value) {
    user.value = resolved
    failed.value = resolved === null
    loading.value = false
  }
}

watch([userId, sessionEpoch], ([id]) => { if (id) void load(id) }, { immediate: true })

const attributes = computed(() => user.value?.attributes ?? {})
const isSelf = computed(() => currentUser.value?.id === userId.value)
// A merged account is closed; its sign-ins and roles moved to the account it names.
const mergedInto = computed(() => attributes.value['aruna-engine.org/merged-into'] || null)
watch(mergedInto, (id) => { if (id) void resolveUsers([id]) }, { immediate: true })
const mergedName = computed(() => (mergedInto.value ? cachedUser(mergedInto.value)?.name || shortUserId(mergedInto.value) : ''))
const crumbs = computed(() => [
  ...(canInspectUsers.value ? [{ label: 'Users', to: { name: 'admin-users' } }] : []),
  { label: user.value?.name ?? 'User profile' },
])
// The groups whose roles name this user among those the caller can read.
const sharedGroups = computed(() =>
  apiGroups.value
    .map((group) => ({
      groupId: group.group_id,
      name: group.display_name,
      roles: (group.roles ?? []).filter((role) => role.assigned_users?.includes(userId.value)).map((role) => role.name),
    }))
    .filter((entry) => entry.roles.length > 0),
)
const askPrompt = computed(() =>
  user.value
    ? `Summarize the datasets and activity of "${user.value.name}" in this realm.`
    : 'Summarize this user and their datasets in this realm.',
)
</script>

<template>
  <div>
    <PageHeader :title="user?.name ?? 'User profile'" :crumbs="crumbs" :docs="{ topic: 'portal-tour' }">
      <template v-if="user" #title>
        <span class="inline-flex flex-wrap items-center gap-3">
          <Avatar :user="{ name: user.name, initials: initials(user.name), avatarColor: colorFor(user.user_id) }" size="md" />
          {{ user.name }}
          <span v-if="isSelf" class="text-sm font-normal text-muted-foreground">(you)</span>
        </span>
      </template>
      <template v-if="user" #description>
        <span class="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span v-if="attributes.affiliation" class="inline-flex items-center gap-1.5"><Building2 class="size-4" />{{ attributes.affiliation }}</span>
          <a v-if="attributes.email" :href="`mailto:${attributes.email}`" class="inline-flex items-center gap-1.5 hover:text-foreground hover:underline"><Mail class="size-4" />{{ attributes.email }}</a>
          <a
            v-if="attributes.orcid"
            :href="`https://orcid.org/${attributes.orcid}`"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 hover:text-foreground hover:underline"
          >
            <ExternalLink class="size-4" />ORCID {{ attributes.orcid }}
          </a>
          <span class="inline-flex items-center gap-1.5 font-mono text-xs" :title="user.user_id">{{ shortUserId(user.user_id) }}<CopyButton :value="user.user_id" label="Copy user ID" /></span>
        </span>
      </template>
      <template #actions>
        <AskAiButton :prompt="askPrompt" :subject="`user ${userId}`" />
        <Button v-if="isSelf" size="sm" variant="outline" as-child>
          <RouterLink :to="{ name: 'settings', query: { tab: 'profile' } }"><Pencil class="h-4 w-4" /> Edit profile</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <div class="w-full px-4 py-6 sm:px-6">
      <Notice v-if="!loading && mergedInto" class="mb-6">
        This account was merged into
        <RouterLink :to="{ name: 'user', params: { id: mergedInto } }" class="font-medium text-primary hover:underline">{{ mergedName }}</RouterLink>.
      </Notice>
      <div v-if="loading" class="space-y-3">
        <Skeleton class="h-20" />
        <Skeleton class="h-32" />
      </div>

      <EmptyState v-else-if="failed" title="This user is not in your realm, or you may not look them up">
        <template #icon><UserRound class="size-6" /></template>
        <Button variant="outline" size="sm" @click="load(userId, true)"><RefreshCw class="h-3.5 w-3.5" /> Try again</Button>
      </EmptyState>

      <section v-else-if="user" aria-labelledby="shared-groups-heading">
        <SectionHeading id="shared-groups-heading" title="Shared groups" :icon="Users" info="Member lists are visible to members only, so this shows the groups you share." />
        <EmptyState v-if="!sharedGroups.length" :title="isSelf ? 'You are not in a group yet.' : 'You share no groups with this user.'">
          <template #icon><Users class="size-6" /></template>
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: 'groups' }"><Users class="h-3.5 w-3.5" /> Browse groups</RouterLink>
          </Button>
        </EmptyState>
        <ul v-else class="surface divide-y divide-border-subtle overflow-hidden">
          <li v-for="entry in sharedGroups" :key="entry.groupId">
            <RouterLink :to="{ name: 'group', params: { id: entry.groupId } }" class="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
              <IconTile :icon="Users" size="sm" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-foreground">{{ entry.name || entry.groupId }}</span>
                <span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck class="size-3.5" />{{ entry.roles.join(', ') }}</span>
              </span>
              <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
