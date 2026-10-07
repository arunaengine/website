<script setup lang="ts">
// The S3 keys whose session token opens this bucket, for key holders and group
// admins. The node never lists a token itself, only the key it belongs to.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import type { HolderSource } from '@/composables/useBucketHolders'
import { ApiError, listBucketTokens, type BucketTokenEntry, type KeyScope } from '@/lib/api'
import { encryptionError } from '@/lib/bucketEncryption'
import { toneVariant } from '@/lib/stateBadge'
import { shortUserId } from '@/lib/utils'

const props = defineProps<{ bucket: string; source: HolderSource }>()

const tokens = ref<BucketTokenEntry[] | null>(null)
const state = ref<'loading' | 'ready' | 'refused' | 'missing' | 'failed'>('loading')
const error = ref<string | null>(null)
const staleCount = computed(() => (tokens.value ?? []).filter((entry) => entry.stale).length)
let loads = 0

async function load() {
  const run = ++loads
  const bound = props.source.binder()
  try {
    const response = await listBucketTokens(props.bucket, props.source.client())
    if (!bound() || run !== loads) return
    tokens.value = response.tokens
    state.value = 'ready'
    error.value = null
  } catch (cause) {
    if (!bound() || run !== loads) return
    tokens.value = null
    const status = cause instanceof ApiError ? cause.status : 0
    if (status === 401 || status === 403) state.value = 'refused'
    else state.value = status === 404 || status === 405 ? 'missing' : 'failed'
    error.value = encryptionError(cause)
  }
}

function scopeText(scope: KeyScope): string {
  if (scope.kind === 'writes') return 'Listed files'
  if (scope.kind === 'exact') return scope.value
  return scope.value ? `${scope.value}…` : 'Whole bucket'
}

function createdLabel(at: string): string {
  const ms = Date.parse(at)
  return Number.isFinite(ms) ? new Date(ms).toLocaleString() : at
}

watch(
  () => props.bucket,
  () => {
    tokens.value = null
    state.value = 'loading'
    void load()
  },
  { immediate: true },
)
watch(props.source.revision, () => void load())
</script>

<template>
  <section class="surface" data-tokens>
    <header class="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Session tokens</h2>
      <Badge v-if="staleCount" :variant="toneVariant('attention')">{{ staleCount }} stale</Badge>
    </header>
    <div class="space-y-3 px-5 py-4">
      <p class="text-xs text-muted-foreground">
        S3 keys whose session token reads this bucket while it is locked. A stale token no longer opens the bucket;
        create a new S3 key to replace it. Revoking a key removes its token.
      </p>
      <Spinner v-if="state === 'loading'" show-label label="Loading the session tokens" />
      <Notice v-else-if="state === 'refused'" tone="info">Only key holders and group admins see the session tokens.</Notice>
      <Notice v-else-if="state === 'missing'" tone="info">
        The node that hosts this bucket does not list session tokens. It may run an older Aruna version.
      </Notice>
      <Notice v-else-if="state === 'failed'" tone="error" :title="error ?? undefined">The session tokens are unknown.</Notice>
      <template v-else-if="tokens">
        <ul v-if="tokens.length" class="divide-y divide-border text-sm">
          <li
            v-for="entry in tokens"
            :key="entry.request_id"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
          >
            <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ entry.access_key_id }}</span>
            <span class="text-xs text-muted-foreground" :title="entry.user_id">{{ shortUserId(entry.user_id) }}</span>
            <span class="text-xs text-muted-foreground" :title="entry.created_at">{{ createdLabel(entry.created_at) }}</span>
            <span class="font-mono text-xs" :title="entry.scope.kind">{{ scopeText(entry.scope) }}</span>
            <span class="text-xs text-muted-foreground">Key generation {{ entry.generation }}</span>
            <span class="text-xs text-muted-foreground">Epochs {{ entry.epochs.join(', ') }}</span>
            <Badge v-if="entry.stale" :variant="toneVariant('attention')">Stale</Badge>
          </li>
        </ul>
        <p v-else class="text-xs text-muted-foreground">No S3 key has a session token for this bucket.</p>
      </template>
    </div>
  </section>
</template>
