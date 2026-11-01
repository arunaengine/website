<script setup lang="ts">
// Adds another account the person can sign in with: it is merged into this one, or, when the
// sign-in has no account yet, attached to it. Each step waits for a click of its own.
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import DetailList from '@/components/ui/DetailList.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import { loginFresh, useAccountMerge } from '@/composables/useAccountMerge'
import { truncateMiddle } from '@/lib/utils'
import { UserPlus } from '@lucide/vue'

const { authToken, userInfo } = useAruna()
const { step, failure, other, result, start, copyVault, merge, attach, cancel } = useAccountMerge()

const open = computed(() => step.value !== 'idle' || failure.value !== null)
const name = computed(() => other.value?.info.user.name ?? 'That account')
const merged = computed(() => userInfo.value?.merged_user_ids ?? [])
const busy = computed(() => ['signing', 'loading', 'merging'].includes(step.value))
// The merge then asks for this account's login first.
const loginOld = computed(() => step.value === 'confirm' && !loginFresh(authToken.value))

const title = computed(() => {
  switch (step.value) {
    case 'unregistered': return 'Attach this sign-in?'
    case 'copy-vault': return 'Copy the vault first?'
    case 'vault-blocked': return 'Merge the vaults first'
    case 'confirm':
    case 'merging': return `Merge ${name.value} into this account?`
    case 'merged': return result.value?.repeated ? 'Already merged' : 'Accounts merged'
    case 'attached': return 'Sign-in attached'
    default: return 'Add another account'
  }
})

const moves = computed(() => {
  const account = other.value
  if (!account) return []
  return [
    { label: 'Sign-ins', value: String(account.info.user.subject_ids.length) },
    { label: 'Groups', value: String(account.info.groups.length) },
    { label: 'Realm roles', value: String(account.info.realm.roles.length) },
    { label: 'Devices', value: `${account.devices}, they sign in again` },
    { label: 'Preferences', value: 'Copied where this account has none' },
  ]
})

const outcome = computed(() => {
  const done = result.value
  if (!done) return []
  return [
    { label: 'Sign-ins', value: String(done.subjects) },
    { label: 'Groups', value: String(done.groups) },
    { label: 'Realm roles', value: String(done.realm_roles) },
    { label: 'Devices', value: String(done.devices) },
    { label: 'Preferences copied', value: String(done.attributes) },
  ]
})

function close(value: boolean) {
  if (!value) cancel()
}
</script>

<template>
  <div class="border-t border-border first:border-t-0">
    <div class="flex items-center gap-3 px-5 py-3">
      <UserPlus class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium text-foreground">Add another account</div>
        <div class="text-xs text-muted-foreground">Sign in with it once to merge it into this one.</div>
      </div>
      <Button size="sm" variant="outline" :disabled="open" @click="start">Add account</Button>
    </div>
    <div v-if="merged.length" class="border-t border-border px-5 py-3">
      <div class="type-label">Merged accounts</div>
      <ul class="mt-1 space-y-1">
        <li v-for="id in merged" :key="id" class="font-mono text-xs text-muted-foreground" :title="id">
          {{ truncateMiddle(id, 12, 8) }}
        </li>
      </ul>
    </div>
  </div>

  <Dialog :open="open" @update:open="close">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="step === 'confirm' || step === 'merging'">
          {{ name }} is closed afterwards. Signing in with it opens this account.
        </DialogDescription>
      </DialogHeader>

      <Spinner v-if="step === 'signing'" show-label label="Sign in with the other account in the new window." />
      <Spinner v-else-if="step === 'loading'" show-label label="Reading the other account…" />
      <p v-else-if="step === 'unregistered'" class="text-sm text-muted-foreground">
        This sign-in has no account yet. Attach it, and it opens this account from now on.
      </p>
      <p v-else-if="step === 'copy-vault'" class="text-sm text-muted-foreground">
        {{ name }} has a vault with keys. Copy it to this account to go on. It keeps its passphrase.
      </p>
      <p v-else-if="step === 'vault-blocked'" class="text-sm text-muted-foreground">
        <template v-if="other?.ownVault">
          Both accounts have a vault. Sign in with {{ name }}, move its entries to this account in the vault view, then delete its vault.
        </template>
        <template v-else>
          The vault of {{ name }} has changes from two browsers. Sign in with it and unlock its vault once, then try again.
        </template>
      </p>
      <template v-else-if="(step === 'confirm' || step === 'merging') && other">
        <p class="truncate font-mono text-xs text-muted-foreground" :title="other.info.user.user_id">
          {{ other.info.user.user_id }}
        </p>
        <section aria-labelledby="merge-moves">
          <h3 id="merge-moves" class="mb-2 text-sm font-medium text-foreground">Moves to this account</h3>
          <DetailList :items="moves" />
        </section>
        <section aria-labelledby="merge-ends">
          <h3 id="merge-ends" class="mb-1 text-sm font-medium text-foreground">Ends</h3>
          <ul class="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
            <li>Its sessions</li>
            <li>Its S3 keys</li>
            <li>Its share links</li>
          </ul>
        </section>
        <Notice v-if="loginOld">You confirm with your own login first.</Notice>
      </template>
      <template v-else-if="step === 'merged'">
        <DetailList :items="outcome" />
        <Notice v-if="result?.attributes_not_copied.length" tone="warning" title="Not copied, this account has no room">
          {{ result.attributes_not_copied.join(', ') }}
        </Notice>
      </template>
      <p v-else-if="step === 'attached'" class="text-sm text-muted-foreground">You can now sign in with it.</p>

      <Notice v-if="failure" tone="error">{{ failure }}</Notice>

      <DialogFooter>
        <template v-if="step === 'merged' || step === 'attached'">
          <Button @click="cancel">Done</Button>
        </template>
        <template v-else>
          <Button variant="outline" @click="cancel">{{ step === 'vault-blocked' || step === 'idle' ? 'Close' : 'Cancel' }}</Button>
          <Button v-if="step === 'unregistered'" @click="attach">Attach sign-in</Button>
          <Button v-else-if="step === 'copy-vault'" @click="copyVault">Copy vault</Button>
          <Button v-else-if="step === 'confirm' || step === 'merging'" :disabled="busy" @click="merge">
            <Spinner v-if="step === 'merging'" class="text-current" aria-hidden="true" /> Merge
          </Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
