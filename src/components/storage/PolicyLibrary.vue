<script setup lang="ts">
// The placement policies this node holds. A node that serves no listing says
// so instead of claiming the realm has none; ids and digests stay in Advanced.
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { placementPoliciesErrorMessage, policyOwnerLabel, policyRefKey } from '@/lib/placementPolicies'
import type { PolicyRefBody, PolicyResponse, SelectorBody } from '@/lib/placementPolicies'
import { truncateMiddle } from '@/lib/utils'
import { Search } from '@lucide/vue'

const { myGroups } = useAruna()
const {
  getPlacementPolicy,
  listCursor,
  listComplete,
  listError,
  listLoadingMore,
  listState,
  listedPolicies,
  loadPolicyPage,
  sessionPolicies,
  sessionPolicyRefs,
} = usePlacementPolicies()

const listed = computed(() => listState.value === 'ready')
const groupName = computed(() => new Map(myGroups.value.map((group) => [group.id, group.name])))

interface Entry {
  ref: PolicyRefBody
  document?: PolicyResponse
}

const entries = computed<Entry[]>(() => {
  if (listed.value) {
    return listedPolicies.value.map((policy) => ({
      ref: { policy_id: policy.policy_id, digest: policy.digest },
      document: policy,
    }))
  }
  return sessionPolicyRefs.value.map((policy) => ({
    ref: policy,
    document: sessionPolicies.value.find((candidate) => policyRefKey(candidate) === policyRefKey(policy)),
  }))
})

const ownerFilter = ref('')
const ownerOptions = computed(() => {
  const owners = new Set<string>()
  for (const entry of entries.value) {
    const owner = entry.document?.owner_group_id
    if (owner) owners.add(owner)
  }
  return [
    { value: '', label: 'Every owner' },
    { value: 'realm', label: 'Realm wide' },
    ...[...owners].map((id) => ({ value: id, label: groupName.value.get(id) ?? truncateMiddle(id) })),
  ]
})

const visible = computed(() => {
  if (!ownerFilter.value) return entries.value
  if (ownerFilter.value === 'realm') {
    return entries.value.filter((entry) => entry.document?.owner_group_id == null)
  }
  return entries.value.filter((entry) => entry.document?.owner_group_id === ownerFilter.value)
})

function owner(entry: Entry): string | undefined {
  return policyOwnerLabel(
    entry.document?.owner_group_id,
    entry.document?.owner_group_id ? groupName.value.get(entry.document.owner_group_id) : null,
  )
}

function conditions(selector: SelectorBody): string {
  const parts: string[] = []
  if (selector.node_id) parts.push(`node ${truncateMiddle(selector.node_id)}`)
  if (selector.location) parts.push(`location ${selector.location}`)
  for (const label of selector.labels) parts.push(`${label.key}=${label.value}`)
  if (selector.executor_kind) parts.push(`executor ${selector.executor_kind}`)
  return parts.join(' and ')
}

const lookup = ref<PolicyRefBody>({ policy_id: '', digest: '' })
const lookupBusy = ref(false)
const lookupError = ref<string | null>(null)
const lookupMessage = ref<string | null>(null)
const lookupReady = computed(
  () => Boolean(lookup.value.policy_id.trim()) && /^[0-9a-f]{64}$/.test(lookup.value.digest.trim()),
)

async function look(policy: PolicyRefBody = lookup.value) {
  if (lookupBusy.value) return
  lookupBusy.value = true
  lookupError.value = null
  lookupMessage.value = null
  try {
    const stored = await getPlacementPolicy({
      policy_id: policy.policy_id.trim(),
      digest: policy.digest.trim(),
    })
    lookupMessage.value = `Loaded ${stored.name}.`
    lookup.value = { policy_id: '', digest: '' }
  } catch (error) {
    lookupError.value = placementPoliciesErrorMessage(error, 'lookup')
  } finally {
    lookupBusy.value = false
  }
}

defineExpose({ reload: () => loadPolicyPage() })
</script>

<template>
  <section class="surface">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
      <div class="flex items-center gap-2">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Published policies</h2>
        <Badge variant="outline" size="count">{{ visible.length }}</Badge>
      </div>
      <Select
        v-if="ownerOptions.length > 2"
        v-model="ownerFilter"
        :options="ownerOptions"
        class="max-w-xs"
        label="Owner"
        aria-label="Filter the policies by owner"
      />
    </header>

    <div class="space-y-4 px-5 py-4">
      <Notice v-if="!listed" tone="warning">
        {{
          listState === 'loading'
            ? 'Reading the policy list…'
            : 'This node serves no policy list, so only what this session touched is shown.'
        }}
      </Notice>
      <p v-else class="text-xs text-muted-foreground">
        As this node holds them. A very recent publication elsewhere may not be here yet.
      </p>

      <ErrorPanel
        v-if="listState === 'error'"
        :message="listError || 'The policy list could not be read.'"
        @retry="loadPolicyPage()"
      />

      <div v-if="visible.length" class="space-y-3">
        <article
          v-for="entry in visible"
          :key="policyRefKey(entry.ref)"
          class="rounded-lg border border-border bg-background p-4"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="text-sm font-semibold text-foreground">
                {{ entry.document?.name ?? 'Policy this node has not loaded' }}
              </h3>
              <Badge v-if="owner(entry)" variant="outline" size="sm" class="mt-1">{{ owner(entry) }}</Badge>
            </div>
            <Button v-if="!entry.document" variant="outline" size="sm" :disabled="lookupBusy" @click="look(entry.ref)">
              Load the definition
            </Button>
          </div>
          <template v-if="entry.document">
            <p class="mt-3 text-[11px] text-muted-foreground">Copies may be stored on a node that fits any of these:</p>
            <div class="mt-1 flex flex-wrap gap-1.5">
              <Badge v-for="(selector, index) in entry.document.allowed" :key="index" variant="outline" size="sm">
                {{ conditions(selector) }}
              </Badge>
            </div>
            <details class="mt-3 rounded-md border border-border px-3 py-2">
              <summary class="cursor-pointer text-[11px] font-medium text-foreground">Advanced</summary>
              <dl class="mt-2 grid grid-cols-[4rem_minmax(0,1fr)] gap-x-2 text-[11px] text-muted-foreground">
                <dt>id</dt>
                <dd class="font-mono">{{ entry.ref.policy_id }}</dd>
                <dt>digest</dt>
                <dd class="break-all font-mono text-[10px]">{{ entry.ref.digest }}</dd>
                <dt>published</dt>
                <dd>{{ new Date(entry.document.created_at_ms).toLocaleString() }}</dd>
              </dl>
            </details>
          </template>
        </article>

        <div v-if="listed && listCursor" class="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" :disabled="listLoadingMore" :aria-busy="listLoadingMore" @click="loadPolicyPage(true)">
            <Spinner v-if="listLoadingMore" label="Loading more policies" class="text-current" />
            {{ listLoadingMore ? 'Loading…' : 'Load more' }}
          </Button>
          <span class="text-[11px] text-muted-foreground">{{ entries.length }} loaded</span>
        </div>
        <p v-else-if="listed && !listComplete" class="text-[11px] text-muted-foreground">
          This is one page of a longer listing, so a policy may exist that it did not name.
        </p>
      </div>
      <EmptyState
        v-else
        compact
        :title="listed ? 'No placement policy is published for this realm yet.' : 'Nothing in this session yet.'"
      />

      <details class="rounded-md border border-border px-3 py-2">
        <summary class="cursor-pointer text-xs font-medium text-foreground">Look one up by id and digest</summary>
        <div class="mt-3 space-y-2">
          <div class="grid gap-2 md:grid-cols-[minmax(12rem,0.8fr)_minmax(20rem,1.4fr)_auto]">
            <Input v-model="lookup.policy_id" class="font-mono text-xs" placeholder="Policy id" aria-label="Policy id to look up" />
            <Input v-model="lookup.digest" class="font-mono text-xs" placeholder="64-character lowercase digest" aria-label="Policy digest to look up" />
            <Button :disabled="lookupBusy || !lookupReady" @click="look()">
              <Search class="size-3.5" /> {{ lookupBusy ? 'Looking up…' : 'Look up' }}
            </Button>
          </div>
          <p v-if="!lookupReady" class="text-[11px] text-muted-foreground">
            Both halves are needed: an id alone could be answered with other bytes.
          </p>
          <p v-if="lookupError" class="text-xs text-destructive">{{ lookupError }}</p>
          <p v-else-if="lookupMessage" class="text-xs text-emerald-700 dark:text-emerald-300">{{ lookupMessage }}</p>
        </div>
      </details>
    </div>
  </section>
</template>
