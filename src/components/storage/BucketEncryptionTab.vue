<script setup lang="ts">
// The encryption of one bucket as the node that hosts it reports it: mode, lock
// state, key fingerprint, format, holders, recovery and any rewrite that runs.
import { computed, toRef } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import DetailList, { type Detail } from '@/components/ui/DetailList.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import SectionSkeleton from '@/components/ui/SectionSkeleton.vue'
import { useBucketEncryption } from '@/composables/useBucketEncryption'
import {
  blockKeysLabel,
  cipherLabel,
  compressionSummary,
  holderSummary,
  lockView,
  maxUnlockLabel,
  modeLabel,
  recoverySummary,
  transitionView,
} from '@/lib/bucketEncryption'
import { stateVariant } from '@/lib/stateBadge'
import { KeyRound } from '@lucide/vue'

const props = defineProps<{ bucket: string; nodeId: string | null; groupId: string | null }>()

const encryption = useBucketEncryption(toRef(props, 'bucket'), toRef(props, 'nodeId'), toRef(props, 'groupId'))
const { status, compression, state, error, refreshing } = encryption

const encrypted = computed(() => Boolean(status.value && status.value.mode !== 'off'))
const lock = computed(() => (status.value ? lockView(status.value) : null))
const recovery = computed(() => recoverySummary(status.value?.recovery ?? null))
const transition = computed(() => (status.value?.transition ? transitionView(status.value.transition) : null))

const details = computed<Detail[]>(() => {
  const current = status.value
  if (!current) return []
  const items: Detail[] = [{ label: 'Mode', value: modeLabel(current.mode) }]
  if (encrypted.value) {
    items.push(
      { label: 'Key fingerprint', value: current.fingerprint ?? 'Unknown', mono: true },
      { label: 'Key generation', value: String(current.key_generation) },
      { label: 'Cipher', value: cipherLabel(current.cipher) },
      { label: 'Block keys', value: blockKeysLabel(current.block_keys) },
      { label: 'Longest unlock', value: maxUnlockLabel(current.max_unlock_ms) },
      { label: 'Key holders', value: holderSummary(current.holders) },
    )
  }
  items.push({ label: 'Compression', value: compressionSummary(compression.value, encrypted.value) })
  return items
})

const permitted = computed(() => {
  const caller = status.value?.caller
  if (!caller) return []
  const lines: string[] = []
  if (caller.holder && caller.ready_copy) lines.push('You hold a ready copy of the bucket key: you may unlock, extend and lock.')
  else if (caller.holder) lines.push('You are a key holder, but your copy is not ready. It is made at the next unlock.')
  if (caller.admin) lines.push('As a group admin you may lock, change the mode, manage key holders and rotate the key.')
  if (!lines.length) lines.push('You may read this state. Unlocking and settings need a key holder or a group admin.')
  return lines
})

const WARNINGS = [
  'An unlock lets every reader with access on this node read the bucket until it locks.',
  'A node restart locks vault-locked buckets.',
  'Recovery needs a usable recovery code or another ready key holder.',
]
</script>

<template>
  <div class="space-y-5">
    <SectionSkeleton v-if="state === 'loading'" label="Loading the encryption state" />
    <Notice v-else-if="state === 'missing'" tone="info" title="Encryption is not reported here">
      The node that hosts this bucket does not report its encryption. It may run an older Aruna version.
    </Notice>
    <Notice v-else-if="state === 'refused'" tone="warning">
      You may not read the encryption settings of this bucket.
    </Notice>
    <Notice v-else-if="state === 'unresolved'" tone="warning">
      The node that hosts this bucket publishes no API address, so its encryption cannot be read from here.
    </Notice>
    <Notice v-else-if="state === 'failed'" tone="error" :title="error ?? undefined">
      The encryption state is unknown until the node answers.
    </Notice>

    <template v-else-if="status">
      <section class="surface">
        <header class="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
          <KeyRound class="size-4 text-primary" />
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Encryption</h2>
          <Badge v-if="lock" :variant="stateVariant(lock.label)" data-lock-state>{{ lock.label }}</Badge>
          <span class="ml-auto inline-flex items-center gap-2 text-[11px] text-muted-foreground">
            <template v-if="encryption.nodeId.value">
              Reported by <NodeLabel :node-id="encryption.nodeId.value" size="sm" />
            </template>
            <RefreshButton size="xs" sr-label="Read the encryption state again" :busy="refreshing" @click="encryption.load()" />
          </span>
        </header>
        <div class="space-y-4 px-5 py-4">
          <p v-if="lock" class="text-xs text-muted-foreground">{{ lock.detail }}</p>
          <DetailList :items="details" />
          <div v-if="encrypted" class="flex flex-wrap items-center gap-2 text-xs">
            <span class="text-muted-foreground">Recovery</span>
            <Badge :variant="stateVariant(recovery.label)" data-recovery>{{ recovery.label }}</Badge>
            <span class="text-muted-foreground">{{ recovery.detail }}</span>
          </div>
          <Notice tone="info" :lines="permitted" />
        </div>
      </section>

      <section v-if="transition" class="surface" data-transition>
        <header class="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
          <h2 class="font-display text-sm font-semibold text-aruna-navy">{{ transition.title }}</h2>
          <Badge :variant="stateVariant(transition.state)">{{ transition.state }}</Badge>
        </header>
        <div class="space-y-2 px-5 py-4 text-xs text-muted-foreground">
          <p>{{ transition.detail }}</p>
          <Notice v-if="status.transition?.blocked_reason" tone="warning">{{ status.transition.blocked_reason }}</Notice>
        </div>
      </section>

      <Notice v-if="encrypted" tone="warning" :lines="WARNINGS" />
    </template>
  </div>
</template>
