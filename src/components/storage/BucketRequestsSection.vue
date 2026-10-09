<script setup lang="ts">
// The key requests that wait on this bucket, for a key holder. Once the vault is open the
// requests are issued here, so a holder from another realm needs no inbox notice.
import { computed, ref, watch } from 'vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import type { HolderSource } from '@/composables/useBucketHolders'
import { useKeyIssue } from '@/composables/useKeyIssue'
import { useUserVault } from '@/composables/useUserVault'
import { ApiError, listKeyRequests } from '@/lib/api'
import { encryptionError } from '@/lib/bucketEncryption'
import { shortUserId } from '@/lib/utils'

const props = defineProps<{ bucket: string; nodeId: string | null; source: HolderSource }>()

const keyIssue = useKeyIssue()
const vaultState = useUserVault().state
const people = ref<string[] | null>(null)
const state = ref<'loading' | 'ready' | 'refused' | 'failed'>('loading')
const error = ref<string | null>(null)
const shown = computed(() => (people.value ?? []).map((user) => shortUserId(user)).join(', '))
let loads = 0

async function load() {
  const run = ++loads
  const bound = props.source.binder()
  const found = new Set<string>()
  try {
    let cursor: string | null = null
    do {
      const page = await listKeyRequests(props.bucket, cursor, props.source.client())
      if (!bound() || run !== loads) return
      page.records.forEach((record) => found.add(record.fields.recipient_user))
      cursor = page.next_cursor
    } while (cursor)
    people.value = [...found]
    state.value = 'ready'
    error.value = null
  } catch (cause) {
    if (!bound() || run !== loads) return
    people.value = null
    const status = cause instanceof ApiError ? cause.status : 0
    state.value = status === 401 || status === 403 || status === 404 ? 'refused' : 'failed'
    error.value = encryptionError(cause)
  }
}

/** Issues what waits for this bucket, then reads the list again. */
async function issue() {
  const target = keyIssue.targetOf(props.bucket, props.nodeId)
  if (target) await keyIssue.issueWaiting([target])
  await load()
}

watch(
  [() => props.bucket, () => props.source.revision.value],
  ([bucket], [before]) => {
    if (bucket !== before) {
      people.value = null
      state.value = 'loading'
    }
    void load()
  },
  { immediate: true },
)
watch(
  [() => props.bucket, vaultState],
  ([, vault]) => {
    if (vault === 'unlocked') void issue()
  },
  { immediate: true },
)
</script>

<template>
  <section v-if="state !== 'refused'" class="surface" data-requests>
    <header class="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Key requests</h2>
    </header>
    <div class="space-y-3 px-5 py-4">
      <Spinner v-if="state === 'loading'" show-label label="Loading the key requests" />
      <Notice v-else-if="state === 'failed'" tone="error" :title="error ?? undefined">The key requests are unknown.</Notice>
      <p v-else-if="!people?.length" class="text-xs text-muted-foreground">No key request waits on this bucket.</p>
      <template v-else>
        <p class="text-xs text-muted-foreground">
          {{ people.length }} {{ people.length === 1 ? 'person waits' : 'people wait' }} for a key: {{ shown }}.
        </p>
        <Notice v-if="vaultState !== 'unlocked'" tone="info">
          Your vault must be unlocked to issue these keys. They are issued when it opens.
        </Notice>
      </template>
    </div>
  </section>
</template>
