<script setup lang="ts">
// Creates a share link for a bucket, folder, file or dataset and lists the item's earlier links,
// each with Copy and Revoke. The link opens without an account and acts with the owner's access.
import { computed, ref, watch } from 'vue'
import { Copy, Share2 } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Input from '@/components/ui/Input.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { linkFor, linkNode, linkSite, shareClient, shareErrorMessage } from '@/composables/useShareLinks'
import { createShare, listShares, revokeShare, shareUrl, type ShareInfo, type ShareMode, type ShareTarget } from '@/lib/api'
import { EXPIRY_OPTIONS, MODE_HINTS, MODE_LABELS, STATUS_LABELS, expiryFor, modesFor, sameTarget, type ExpiryChoice } from '@/lib/shareLinks'
import { copyToClipboard, formatDateTime } from '@/lib/utils'

const props = defineProps<{
  open: boolean
  target: ShareTarget | null
  /** The node that holds the data; null is the connected node. */
  nodeId: string | null
  name: string
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const mode = ref<ShareMode>('read')
const expiry = ref<ExpiryChoice>('7')
const password = ref('')
const label = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const created = ref<{ url: string; share: ShareInfo } | null>(null)
const copied = ref(false)
const existing = ref<ShareInfo[]>([])
const existingLoading = ref(false)
const existingError = ref<string | null>(null)
const rowBusy = ref<string | null>(null)

const modes = computed(() => (props.target ? modesFor(props.target) : ['read' as const]))
const modeOptions = computed(() => modes.value.map((value) => ({ value, label: MODE_LABELS[value] })))
const expiryOptions = EXPIRY_OPTIONS.map((option) => ({ ...option }))

// Each opening starts a fresh form; answers for an earlier item are dropped.
let generation = 0
watch(
  () => [props.open, props.target] as const,
  ([open]) => {
    generation += 1
    if (!open) return
    mode.value = 'read'
    expiry.value = '7'
    password.value = ''
    label.value = ''
    error.value = null
    created.value = null
    copied.value = false
    void loadExisting()
  },
  { immediate: true },
)

async function loadExisting() {
  const run = generation
  const target = props.target
  if (!target) return
  existingLoading.value = true
  existingError.value = null
  try {
    const shares = await listShares(await shareClient(props.nodeId))
    if (run === generation) existing.value = shares.filter((share) => sameTarget(share.target, target))
  } catch (cause) {
    if (run === generation) existingError.value = shareErrorMessage(cause)
  } finally {
    if (run === generation) existingLoading.value = false
  }
}

async function create() {
  const target = props.target
  const site = linkSite()
  const node = linkNode(props.nodeId)
  if (!target) return
  if (!site || !node) {
    error.value = site ? 'The node of this data is not known yet.' : 'The realm website is not known, so there is no link.'
    return
  }
  const run = generation
  busy.value = true
  error.value = null
  try {
    const answer = await createShare(
      {
        target,
        mode: mode.value,
        ...(label.value.trim() ? { label: label.value.trim() } : {}),
        ...(expiry.value === 'never' ? {} : { expires_at: expiryFor(expiry.value) }),
        ...(password.value ? { password: password.value } : {}),
      },
      await shareClient(props.nodeId),
    )
    if (run !== generation) return
    created.value = { url: shareUrl(site, node, answer.token), share: answer.share }
    existing.value = [...existing.value, answer.share]
  } catch (cause) {
    if (run === generation) error.value = shareErrorMessage(cause)
  } finally {
    if (run === generation) busy.value = false
  }
}

async function copyCreated() {
  if (!created.value) return
  await copyToClipboard(created.value.url)
  copied.value = true
}

async function copyExisting(share: ShareInfo) {
  rowBusy.value = share.id
  existingError.value = null
  try {
    await copyToClipboard(await linkFor(share.id, props.nodeId))
  } catch (cause) {
    existingError.value = shareErrorMessage(cause)
  } finally {
    rowBusy.value = null
  }
}

async function revoke(share: ShareInfo) {
  rowBusy.value = share.id
  existingError.value = null
  try {
    await revokeShare(share.id, await shareClient(props.nodeId))
    const at = new Date().toISOString()
    existing.value = existing.value.map((entry) => (entry.id === share.id ? { ...entry, status: 'revoked', revoked_at: at } : entry))
  } catch (cause) {
    existingError.value = shareErrorMessage(cause)
  } finally {
    rowBusy.value = null
  }
}

const expiresText = (at: string | null) => (at ? formatDateTime(at) : 'No expiry')
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex min-w-0 items-center gap-2">
          <Share2 class="h-4 w-4 shrink-0 text-primary" /> <span class="truncate">Share {{ name }}</span>
        </DialogTitle>
        <DialogDescription>Anyone with the link can open it without an account. It works with your access.</DialogDescription>
      </DialogHeader>

      <div v-if="created" class="space-y-3">
        <div>
          <label for="share-link-url" class="text-xs font-medium text-foreground">Link</label>
          <div class="mt-1 flex items-center gap-2">
            <Input id="share-link-url" :model-value="created.url" readonly class="font-mono text-xs" @focus="($event.target as HTMLInputElement).select()" />
            <Button size="sm" class="shrink-0" @click="copyCreated"><Copy class="h-3.5 w-3.5" /> {{ copied ? 'Copied' : 'Copy link' }}</Button>
          </div>
        </div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt class="text-muted-foreground">Access</dt>
          <dd class="text-foreground">{{ MODE_LABELS[created.share.mode] }}</dd>
          <dt class="text-muted-foreground">Expires</dt>
          <dd class="text-foreground">{{ expiresText(created.share.expires_at) }}</dd>
          <dt class="text-muted-foreground">Password</dt>
          <dd class="text-foreground">{{ created.share.password ? 'Yes, send it separately' : 'No' }}</dd>
        </dl>
      </div>

      <form v-else class="space-y-3" @submit.prevent="create">
        <div>
          <span class="text-xs font-medium text-foreground">Access</span>
          <div class="mt-1">
            <OptionToggle v-if="modeOptions.length > 1" v-model="mode" :options="modeOptions" aria-label="Access" />
            <p v-else class="text-sm text-foreground">{{ MODE_LABELS.read }}</p>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">{{ MODE_HINTS[mode] }}</p>
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Expires after</label>
          <Select v-model="expiry" :options="expiryOptions" aria-label="Expires after" class="mt-1" />
        </div>
        <div>
          <label for="share-link-password" class="text-xs font-medium text-foreground">Password (optional)</label>
          <Input id="share-link-password" v-model="password" type="password" autocomplete="new-password" class="mt-1" />
        </div>
        <div>
          <label for="share-link-label" class="text-xs font-medium text-foreground">Label (optional)</label>
          <Input id="share-link-label" v-model="label" maxlength="256" placeholder="Only you see it" class="mt-1" />
        </div>
        <RefusalNote v-if="error" :message="error" />
      </form>

      <section v-if="existingLoading || existingError || existing.length" aria-labelledby="share-existing-heading" class="space-y-2 border-t border-border pt-3">
        <h3 id="share-existing-heading" class="text-xs font-medium text-foreground">Links for this item</h3>
        <Spinner v-if="existingLoading" label="Loading links" />
        <RefusalNote v-if="existingError" :message="existingError" />
        <div v-if="existing.length" class="min-w-0 overflow-x-auto">
          <table class="data-table min-w-max text-xs">
            <thead>
              <tr>
                <th class="py-1.5 pr-4 text-left font-semibold">Access</th>
                <th class="py-1.5 pr-4 text-left font-semibold">Expires</th>
                <th class="py-1.5 pr-4 text-left font-semibold">Password</th>
                <th class="py-1.5 pr-4 text-left font-semibold">Status</th>
                <th class="py-1.5"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="share in existing" :key="share.id" class="border-t border-border">
                <td class="py-1.5 pr-4 text-foreground">{{ MODE_LABELS[share.mode] }}</td>
                <td class="whitespace-nowrap py-1.5 pr-4 text-muted-foreground">{{ expiresText(share.expires_at) }}</td>
                <td class="py-1.5 pr-4 text-muted-foreground">{{ share.password ? 'Yes' : 'No' }}</td>
                <td class="py-1.5 pr-4 text-muted-foreground">{{ STATUS_LABELS[share.status] }}</td>
                <td class="whitespace-nowrap py-1.5 text-right">
                  <template v-if="share.status === 'active'">
                    <Button variant="ghost" size="icon-sm" :disabled="rowBusy === share.id" aria-label="Copy link" title="Copy link" @click="copyExisting(share)"><Copy class="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" class="text-destructive" :disabled="rowBusy === share.id" @click="revoke(share)">Revoke</Button>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <DialogFooter>
        <template v-if="created">
          <Button @click="emit('update:open', false)">Done</Button>
        </template>
        <template v-else>
          <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
          <Button :disabled="busy || !target" @click="create">{{ busy ? 'Creating…' : 'Create link' }}</Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
