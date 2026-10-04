<script setup lang="ts">
// Who may unlock this bucket, how ready their key copy is, and whether the
// recovery rule holds. Group admins grant and remove explicit key holders.
import { computed, ref, toRef, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import {
  listedRecovery,
  recoveryAfter,
  useBucketHolders,
  type HolderSource,
  type RecoveryAfter,
} from '@/composables/useBucketHolders'
import type { BucketHolderEntry, UserSearchHit } from '@/lib/api'
import { HOLDER_STATE_LABEL, ORIGIN_LABEL, encryptionError, recoverySummary } from '@/lib/bucketEncryption'
import { stateVariant } from '@/lib/stateBadge'
import { errorMessage, shortUserId } from '@/lib/utils'

/** `frozen`: the bucket state is out of date, so no change is sent. */
const props = defineProps<{ bucket: string; canManage: boolean; frozen?: boolean; source: HolderSource }>()

const { searchUsers } = useAruna()
const { holders, state, error, grant, remove } = useBucketHolders(props.source, toRef(props, 'bucket'))

const list = computed(() => holders.value?.holders ?? [])
const recovery = computed(() => recoverySummary(holders.value ? listedRecovery(holders.value) : null))
const partial = computed(() => Boolean(holders.value && holders.value.complete !== true))
const busy = ref<string | null>(null)
const failure = ref<string | null>(null)
const pending = ref<BucketHolderEntry | null>(null)
const pendingRecovery = ref<Exclude<RecoveryAfter, 'kept'>>('unmet')
const accepted = ref(false)

const query = ref('')
const results = ref<UserSearchHit[]>([])
const chosen = ref<UserSearchHit | null>(null)
const searchState = ref<'idle' | 'searching' | 'done' | 'failed'>('idle')
const searchError = ref<string | null>(null)
let searches = 0
const runSearch = useDebounceFn(async (term: string, run: number) => {
  if (term.length < 2 || run !== searches) return
  try {
    const response = await searchUsers(term)
    if (run !== searches) return
    results.value = response.users.filter((hit) => !list.value.some((holder) => holder.user_id === hit.user_id))
    searchState.value = 'done'
  } catch (cause) {
    if (run !== searches) return
    searchError.value = errorMessage(cause)
    searchState.value = 'failed'
  }
}, 250)
watch(query, (term) => {
  if (chosen.value && term === chosen.value.name) return
  chosen.value = null
  results.value = []
  searchError.value = null
  searchState.value = term.trim().length >= 2 ? 'searching' : 'idle'
  void runSearch(term.trim(), ++searches)
})

function nameOf(entry: BucketHolderEntry): string {
  return entry.name || shortUserId(entry.user_id)
}

async function addHolder() {
  if (!chosen.value) return
  busy.value = chosen.value.user_id
  failure.value = null
  try {
    await grant(chosen.value.user_id)
    query.value = ''
    chosen.value = null
  } catch (cause) {
    failure.value = encryptionError(cause)
  } finally {
    busy.value = null
  }
}

async function removeHolder(entry: BucketHolderEntry, confirm: boolean) {
  busy.value = entry.user_id
  failure.value = null
  try {
    const result = await remove(entry.user_id, confirm)
    if (result === 'confirm' && pending.value !== entry) pendingRecovery.value = 'unmet'
    pending.value = result === 'confirm' ? entry : null
    accepted.value = false
  } catch (cause) {
    failure.value = encryptionError(cause)
  } finally {
    busy.value = null
  }
}

function startRemove(entry: BucketHolderEntry) {
  const after = holders.value ? recoveryAfter(holders.value, entry.user_id) : 'unknown'
  if (after === 'kept') {
    void removeHolder(entry, false)
    return
  }
  accepted.value = false
  pendingRecovery.value = after
  pending.value = entry
}
</script>

<template>
  <section class="surface" data-holders>
    <header class="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Key holders</h2>
      <Badge v-if="holders" :variant="stateVariant(recovery.label)">Recovery: {{ recovery.label }}</Badge>
    </header>
    <div class="space-y-3 px-5 py-4">
      <Spinner v-if="state === 'loading'" show-label label="Loading the key holders" />
      <Notice v-else-if="state === 'refused'" tone="info">Only key holders and group admins see the key holders.</Notice>
      <Notice v-else-if="state === 'failed'" tone="error" :title="error ?? undefined">The key holders are unknown.</Notice>
      <template v-else-if="holders">
        <p class="text-xs text-muted-foreground">{{ recovery.detail }}</p>
        <Notice v-if="partial" tone="warning" data-partial>
          {{ holders?.unresolved || 'Some' }} key {{ holders?.unresolved === 1 ? 'holder' : 'holders' }} could not be looked up,
          so this list is partial.
        </Notice>
        <ul class="divide-y divide-border text-sm">
          <li v-for="entry in list" :key="entry.user_id" class="flex flex-wrap items-center gap-2 py-2">
            <span class="min-w-0 flex-1 truncate" :title="entry.user_id">{{ nameOf(entry) }}</span>
            <span class="text-xs text-muted-foreground">{{ ORIGIN_LABEL[entry.origin] ?? entry.origin }}</span>
            <Badge :variant="stateVariant(HOLDER_STATE_LABEL[entry.state] ?? 'unknown')">
              {{ HOLDER_STATE_LABEL[entry.state] ?? 'Unknown' }}
            </Badge>
            <span class="text-xs text-muted-foreground">
              Recovery code: {{ entry.has_recovery === null ? 'unknown' : entry.has_recovery ? 'yes' : 'no' }}
            </span>
            <Button
              v-if="canManage && entry.origin === 'explicit'"
              size="sm"
              variant="outline"
              :disabled="busy !== null || frozen"
              @click="startRemove(entry)"
            >
              Remove
            </Button>
          </li>
        </ul>
        <p v-if="!list.length" class="text-xs text-muted-foreground">This bucket has no key holders.</p>
        <Notice tone="warning">Removing a key holder does not erase copies of the key they already made.</Notice>
      </template>

      <div v-if="canManage" class="space-y-1.5">
        <label class="text-xs font-medium text-foreground" for="holder-search">Grant a key holder</label>
        <div class="relative flex gap-2">
          <Input id="holder-search" v-model="query" placeholder="Search users (min 2 characters)" />
          <Button size="sm" :disabled="!chosen || busy !== null || frozen" @click="addHolder">Grant</Button>
          <div
            v-if="searchState !== 'idle' && !chosen"
            class="absolute top-10 z-10 w-full rounded-md border border-border bg-popover shadow-md"
            data-search-results
          >
            <p v-if="searchState === 'searching'" class="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
            <p v-else-if="searchState === 'failed'" class="px-3 py-2 text-xs text-destructive">
              The user search failed: {{ searchError }}
            </p>
            <p v-else-if="!results.length" class="px-3 py-2 text-xs text-muted-foreground">No matching users.</p>
            <button
              v-for="hit in results"
              :key="hit.user_id"
              type="button"
              class="flex w-full justify-between px-3 py-1.5 text-left text-sm hover:bg-muted"
              @click="chosen = hit; query = hit.name"
            >
              <span class="truncate">{{ hit.name }}</span>
              <span class="font-mono text-[10px] text-muted-foreground">{{ shortUserId(hit.user_id) }}</span>
            </button>
          </div>
        </div>
        <p class="text-[11px] text-muted-foreground">The new key holder gets a copy at the next unlock.</p>
      </div>
      <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    </div>

    <Dialog :open="Boolean(pending)" @update:open="(open: boolean) => !open && (pending = null)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {{ pending ? nameOf(pending) : '' }}?</DialogTitle>
          <DialogDescription>
            <template v-if="pendingRecovery === 'unmet'">
              After this removal the recovery rule is not met: fewer than two ready key holders remain, and none has a
              recovery code.
            </template>
            <template v-else>
              After this removal the recovery rule cannot be verified: a remaining recovery code is unknown, or some key
              holders could not be looked up.
            </template>
            If the remaining usable key is then lost too, the data in this bucket cannot be read again.
          </DialogDescription>
        </DialogHeader>
        <label class="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" class="mt-0.5" :checked="accepted" @click="accepted = !accepted" />
          <span>
            {{ pendingRecovery === 'unmet' ? 'I accept that the recovery rule is not met.' : 'I accept that recovery cannot be verified.' }}
          </span>
        </label>
        <DialogFooter>
          <Button variant="outline" size="sm" @click="pending = null">Cancel</Button>
          <Button
            variant="destructive"
            size="sm"
            :disabled="!accepted || busy !== null || frozen"
            @click="pending && removeHolder(pending, true)"
          >
            Remove anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
