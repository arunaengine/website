<script setup lang="ts">
// After a removal on an ABE bucket: protect new uploads now, and give existing files new keys.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import type { HolderSource } from '@/composables/useBucketHolders'
import { ApiError, apiErrorMessage, raiseBucketEpoch, rekeyBucketPrefix } from '@/lib/api'
import { actionError } from '@/lib/bucketEncryption'
import { toneVariant } from '@/lib/stateBadge'

/** `frozen`: the bucket state is out of date, so no change is sent. */
const props = defineProps<{ bucket: string; source: HolderSource; frozen?: boolean }>()

const status = computed(() => props.source.status.value)
const abe = computed(() => status.value?.abe ?? null)
const locked = computed(() => status.value?.mode !== 'node_managed' && status.value?.unlock?.state !== 'unlocked')

const raised = ref(false)
const raising = ref(false)
const raiseError = ref<string | null>(null)
const waiting = computed(() => Boolean(abe.value?.raise_due))

const folder = ref('')
const running = ref(false)
const count = ref<number | null>(null)
const rekeyError = ref<string | null>(null)
const pending = ref(false)
/** Wait before asking again while a file in the folder is still pending. */
const RETRY_MS = 5000
const reported = computed(() => abe.value?.rekey ?? null)
const shownCount = computed(() => count.value ?? reported.value?.rekeyed ?? null)

watch(
  () => reported.value?.prefix,
  (prefix) => {
    if (prefix !== undefined && !running.value) folder.value = prefix
  },
  { immediate: true },
)

function keyError(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 403) return 'Only key holders can do this.'
  return cause instanceof ApiError && cause.status === 409 ? apiErrorMessage(cause) : actionError(cause)
}

async function protectUploads() {
  const bound = props.source.binder()
  raising.value = true
  raiseError.value = null
  try {
    await raiseBucketEpoch(props.bucket, props.source.client())
    if (!bound()) return
    raised.value = true
    await props.source.load()
  } catch (cause) {
    if (bound()) raiseError.value = keyError(cause)
  } finally {
    raising.value = false
  }
}

async function replaceKeys() {
  const trimmed = folder.value.trim()
  const prefix = trimmed && !trimmed.endsWith('/') ? `${trimmed}/` : trimmed
  const bound = props.source.binder()
  folder.value = prefix
  running.value = true
  rekeyError.value = null
  count.value = reported.value?.prefix === prefix ? reported.value.rekeyed : null
  try {
    for (;;) {
      let page
      try {
        page = await rekeyBucketPrefix(props.bucket, prefix, props.source.client())
      } catch (cause) {
        if (!(cause instanceof ApiError && cause.code === 'rekey_pending')) throw cause
        pending.value = true
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
        if (!bound()) return
        continue
      }
      if (!bound()) return
      pending.value = false
      count.value = page.rekeyed
      if (page.done) break
    }
  } catch (cause) {
    if (bound()) rekeyError.value = keyError(cause)
  } finally {
    running.value = false
    pending.value = false
    if (bound()) void props.source.load()
  }
}
</script>

<template>
  <section v-if="waiting || raised" class="surface" data-removed-access>
    <header class="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Removed access</h2>
      <Badge v-if="waiting" :variant="toneVariant('attention')">Waiting</Badge>
      <Badge v-else :variant="toneVariant('done')">Protected</Badge>
    </header>
    <div class="space-y-3 px-5 py-4 text-xs text-muted-foreground">
      <template v-if="waiting">
        <p>
          Removed people are blocked now. New uploads get new keys after you confirm, or when a key holder next opens
          their vault.
        </p>
        <Button size="sm" :disabled="raising || frozen" @click="protectUploads">Protect new uploads now</Button>
      </template>
      <p v-else>New uploads use new keys. Older files keep their keys; replace them below if needed.</p>
      <Notice v-if="raiseError" tone="error">{{ raiseError }}</Notice>
    </div>
  </section>

  <section class="surface" data-rekey>
    <header class="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Replace keys for existing files</h2>
      <Badge v-if="running || reported" :variant="toneVariant('progress')">Running</Badge>
    </header>
    <div class="space-y-3 px-5 py-4 text-xs text-muted-foreground">
      <p>Gives every file in a folder a new key. Copies people already downloaded stay with them.</p>
      <div class="flex gap-2">
        <Input v-model="folder" placeholder="Folder (empty means the whole bucket)" :disabled="running" />
        <Button size="sm" variant="outline" :disabled="locked || running || frozen" @click="replaceKeys">
          Replace keys
        </Button>
      </div>
      <Notice v-if="locked" tone="info">Unlock the bucket first.</Notice>
      <template v-if="shownCount !== null">
        <p data-rekey-count>{{ shownCount }} files done.</p>
        <p v-if="running || reported">You can leave this page. Start again with the same folder to continue.</p>
      </template>
      <Notice v-if="pending" tone="info">Some files are still uploading. Trying again shortly.</Notice>
      <Notice v-if="rekeyError" tone="error">{{ rekeyError }}</Notice>
    </div>
  </section>
</template>
