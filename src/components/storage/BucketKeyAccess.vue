<script setup lang="ts">
// Every key generation the node still needs, each with its fingerprint and lock
// state: the active key, and the previous key while stored versions are rewritten.
import { computed, reactive, ref } from 'vue'
import BucketUnlockDialog from '@/components/storage/BucketUnlockDialog.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import type { BucketEncryptionResponse, BucketKeyGeneration } from '@/lib/api'
import { ROLE_LABEL, durationOptions, encryptionError, keyGenerations, unlockView } from '@/lib/bucketEncryption'
import { stateVariant } from '@/lib/stateBadge'
import type { UnlockOutcome } from '@/lib/vault/bucketUnlock'

const props = defineProps<{
  bucket: string
  status: BucketEncryptionResponse
  busy: boolean
  outcomeUnknown: boolean
  unlock: (generation: number, durationMs?: number) => Promise<UnlockOutcome | null>
  extend: (generation: number, durationMs?: number) => Promise<unknown>
  lock: () => Promise<unknown>
}>()

const keys = computed(() => keyGenerations(props.status))
const caller = computed(() => props.status.caller)
const nodeManaged = computed(() => props.status.mode === 'node_managed')
const extendOptions = computed(() => durationOptions(props.status.max_unlock_ms))
const extendBy = reactive<Record<number, string>>({})
const unlockTarget = ref<BucketKeyGeneration | null>(null)
const actionError = ref<string | null>(null)

function canUnlock(key: BucketKeyGeneration): boolean {
  return key.unlock.state === 'locked' && caller.value.holder && (key.role === 'source' || caller.value.ready_copy)
}

function canExtend(key: BucketKeyGeneration): boolean {
  return key.unlock.state === 'unlocked' && caller.value.holder && Boolean(key.unlock.session_id)
}

const canLock = computed(
  () => keys.value.list.some((key) => key.unlock.state === 'unlocked') && (caller.value.holder || caller.value.admin),
)
const anyAction = computed(() => canLock.value || keys.value.list.some((key) => canUnlock(key) || canExtend(key)))

async function act(work: () => Promise<unknown>) {
  actionError.value = null
  try {
    await work()
  } catch (cause) {
    actionError.value = encryptionError(cause)
  }
}

function extendKey(key: BucketKeyGeneration) {
  const chosen = extendBy[key.generation]
  return act(() => props.extend(key.generation, chosen ? Number(chosen) : undefined))
}
</script>

<template>
  <section class="surface" data-key-access>
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Key access</h2>
    </header>
    <div class="space-y-3 px-5 py-4">
      <Notice v-if="outcomeUnknown" tone="warning" title="The last unlock was not confirmed">
        Read the state again before you try once more; the key is never sent twice on its own.
      </Notice>
      <Notice v-if="!keys.reported" tone="info">
        The node did not list its key generations, so only the active key is shown.
      </Notice>
      <ul class="divide-y divide-border">
        <li v-for="key in keys.list" :key="key.generation" class="space-y-1.5 py-3" :data-generation="key.generation">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-medium text-foreground">{{ ROLE_LABEL[key.role] ?? 'Key' }}</span>
            <span class="text-xs text-muted-foreground">generation {{ key.generation }}</span>
            <Badge :variant="stateVariant(unlockView(key.unlock, nodeManaged).label)">
              {{ unlockView(key.unlock, nodeManaged).label }}
            </Badge>
          </div>
          <p class="break-all text-[11px] text-muted-foreground">
            Fingerprint <span class="font-mono">{{ key.fingerprint }}</span>
          </p>
          <p class="text-xs text-muted-foreground">
            {{ unlockView(key.unlock, nodeManaged).detail }}
            <template v-if="key.role === 'source'">This key is needed until the stored versions are rewritten.</template>
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <Button v-if="canUnlock(key)" size="sm" :disabled="busy || outcomeUnknown" @click="unlockTarget = key">
              Unlock
            </Button>
            <template v-if="canExtend(key)">
              <Select
                class="w-56"
                :model-value="extendBy[key.generation] ?? ''"
                :options="extendOptions"
                aria-label="Extend the unlock by"
                @update:model-value="(value: string) => (extendBy[key.generation] = value)"
              />
              <Button size="sm" variant="outline" :disabled="busy" @click="extendKey(key)">Extend</Button>
            </template>
          </div>
        </li>
      </ul>
      <div class="flex flex-wrap items-center gap-2">
        <Button v-if="canLock" size="sm" variant="outline" :disabled="busy" @click="act(lock)">Lock now</Button>
        <span v-if="!anyAction" class="text-xs text-muted-foreground">No key action is open to you right now.</span>
      </div>
      <Notice v-if="actionError" tone="error">{{ actionError }}</Notice>
    </div>

    <BucketUnlockDialog
      :open="unlockTarget !== null"
      :bucket="bucket"
      :generation="unlockTarget?.generation ?? 0"
      :role="unlockTarget?.role ?? 'active'"
      :max-unlock-ms="status.max_unlock_ms"
      :unlock="unlock"
      @update:open="(open: boolean) => !open && (unlockTarget = null)"
    />
  </section>
</template>
