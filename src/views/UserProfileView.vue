<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Button from '@/components/ui/Button.vue'
import AskAiButton from '@/components/assistant/AskAiButton.vue'
import { useAruna, colorFor, initials } from '@/composables/useAruna'
import { useUserDirectory } from '@/composables/useUserDirectory'
import { shortUserId } from '@/lib/utils'
import type { GetUserResponse } from '@/lib/api'
import { ExternalLink, UserRound } from '@lucide/vue'

const route = useRoute()
const { currentUser } = useAruna()
const { resolveUser } = useUserDirectory()

const userId = computed(() => (route.params.id as string) || '')
const user = ref<GetUserResponse | null>(null)
const loading = ref(false)
const failed = ref(false)

async function load(id: string, force = false) {
  loading.value = true
  failed.value = false
  user.value = null
  const resolved = await resolveUser(id, { force })
  // Only apply if the route hasn't moved on meanwhile.
  if (userId.value === id) {
    user.value = resolved
    failed.value = resolved === null
    loading.value = false
  }
}

watch(userId, (id) => { if (id) void load(id) }, { immediate: true })

const attributes = computed(() => user.value?.attributes ?? {})
const isSelf = computed(() => currentUser.value?.id === userId.value)
const askPrompt = computed(() =>
  user.value
    ? `Summarize the datasets and activity of "${user.value.name}" in this realm.`
    : 'Summarize this user and their datasets in this realm.',
)
</script>

<template>
  <div>
    <PageHeader :title="user?.name ?? 'User profile'" description="Public profile resolved from this realm's user directory." />

    <div class="container py-8">
      <div v-if="loading" class="space-y-3">
        <Skeleton class="h-20" />
        <Skeleton class="h-32" />
      </div>

      <section v-else-if="failed" class="surface mx-auto max-w-xl p-8 text-center">
        <UserRound class="mx-auto h-8 w-8 text-muted-foreground/70" />
        <h2 class="mt-3 font-display text-base font-semibold text-aruna-navy">User not found</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">
          This user does not exist in your realm, or you are not signed in with an account that may resolve it.
        </p>
        <Button variant="outline" size="sm" class="mt-4" @click="load(userId, true)">Try again</Button>
      </section>

      <section v-else-if="user" class="surface p-6">
        <div class="flex items-start gap-4">
          <Avatar :user="{ name: user.name, initials: initials(user.name), avatarColor: colorFor(user.user_id) }" size="lg" />
          <div class="min-w-0 flex-1">
            <h2 class="font-display text-xl font-semibold tracking-tight text-aruna-navy">
              {{ user.name }}
              <span v-if="isSelf" class="ml-1 text-xs font-normal text-muted-foreground">(you)</span>
            </h2>
            <div v-if="attributes.affiliation" class="mt-0.5 text-sm text-muted-foreground">{{ attributes.affiliation }}</div>
            <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              <AskAiButton :prompt="askPrompt" />
              <a v-if="attributes.email" :href="`mailto:${attributes.email}`" class="text-primary hover:underline">{{ attributes.email }}</a>
              <a
                v-if="attributes.orcid"
                :href="`https://orcid.org/${attributes.orcid}`"
                target="_blank"
                rel="noopener"
                class="inline-flex items-center gap-1 text-primary hover:underline"
              >
                ORCID {{ attributes.orcid }} <ExternalLink class="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        <div class="mt-6 rounded-md border border-border bg-muted/40 px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-muted-foreground">User ID</div>
          <div class="flex items-center justify-between gap-2">
            <span class="break-all font-mono text-[11px] text-foreground" :title="user.user_id">
              {{ shortUserId(user.user_id) }} <span class="text-muted-foreground">· full ID via copy</span>
            </span>
            <CopyButton :value="user.user_id" label="Copy user ID" />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
