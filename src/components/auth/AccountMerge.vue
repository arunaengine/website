<script setup lang="ts">
// Adds another account the person can sign in with: it is merged into this one, or, when the
// sign-in has no account yet, attached to it. Each step waits for a click of its own.
import { computed } from 'vue'
import LoginOptions from '@/components/auth/LoginOptions.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import IconTile from '@/components/ui/IconTile.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import { loginFresh, useAccountMerge } from '@/composables/useAccountMerge'
import { portalConfig } from '@/lib/config'
import { truncateMiddle } from '@/lib/utils'
import {
  ArrowRight,
  CircleCheck,
  KeyRound,
  Laptop,
  Link2Off,
  LockKeyhole,
  LogIn,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  UserRound,
  Users,
  Vault,
} from '@lucide/vue'
import type { Component } from 'vue'

const { authToken, userInfo } = useAruna()
const { step, failure, other, result, choose, start, copyVault, merge, attach, cancel } = useAccountMerge()
// With configured logins the person picks the login of each sign-in, otherwise the realm's own.
const hasLogins = portalConfig().login.options.length > 0

const open = computed(() => step.value !== 'idle' || failure.value !== null)
const name = computed(() => other.value?.info.user.name ?? 'That account')
// A node without the names still lists the ids.
const merged = computed(
  () => userInfo.value?.merged_users ?? (userInfo.value?.merged_user_ids ?? []).map((user_id) => ({ user_id, name: null })),
)
const busy = computed(() => ['signing', 'loading', 'merging'].includes(step.value))
// The merge then asks for this account's login first.
const loginOld = computed(() => step.value === 'confirm' && !loginFresh(authToken.value))
// An old own login is renewed through the login the person picks.
const ownLogin = computed(() => hasLogins && ['confirm', 'unregistered'].includes(step.value) && !loginFresh(authToken.value))

function add() {
  if (hasLogins) choose()
  else void start()
}

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
    { icon: LogIn, label: 'Sign-ins', value: String(account.info.user.subject_ids.length) },
    { icon: Users, label: 'Groups', value: String(account.info.groups.length) },
    { icon: ShieldCheck, label: 'Realm roles', value: String(account.info.realm.roles.length) },
    { icon: Laptop, label: 'Devices', value: `${account.devices}, they sign in again` },
    { icon: SlidersHorizontal, label: 'Preferences', value: 'Copied where this account has none' },
  ]
})

const outcome = computed(() => {
  const done = result.value
  if (!done) return []
  return [
    { icon: LogIn, label: 'Sign-ins', value: String(done.subjects) },
    { icon: Users, label: 'Groups', value: String(done.groups) },
    { icon: ShieldCheck, label: 'Realm roles', value: String(done.realm_roles) },
    { icon: Laptop, label: 'Devices', value: String(done.devices) },
    { icon: SlidersHorizontal, label: 'Preferences copied', value: String(done.attributes) },
  ]
})

const ends = [
  { icon: LogOut, label: 'Its sessions' },
  { icon: KeyRound, label: 'Its S3 keys' },
  { icon: Link2Off, label: 'Its share links' },
]

// One tile per step that has no list of its own, so no step is text alone.
const stepTile = computed<{ icon: Component; tone: 'royal' | 'ok' | 'warn' } | null>(() => {
  switch (step.value) {
    case 'unregistered': return { icon: LogIn, tone: 'royal' }
    case 'copy-vault': return { icon: Vault, tone: 'royal' }
    case 'vault-blocked': return { icon: LockKeyhole, tone: 'warn' }
    case 'attached': return { icon: CircleCheck, tone: 'ok' }
    default: return null
  }
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
      <Button size="sm" variant="outline" :disabled="open" @click="add">Add account</Button>
    </div>
    <div v-if="merged.length" class="border-t border-border px-5 py-3">
      <div class="type-label">Merged accounts</div>
      <ul class="mt-1 space-y-1">
        <li v-for="account in merged" :key="account.user_id" class="flex items-center gap-2 text-xs text-muted-foreground" :title="account.user_id">
          <UserRound class="size-3.5 shrink-0" aria-hidden="true" />
          <span v-if="account.name">{{ account.name }}</span>
          <span v-else class="font-mono">{{ truncateMiddle(account.user_id, 12, 8) }}</span>
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
        <DialogDescription v-else-if="step === 'choose'">Choose how you sign in with the other account.</DialogDescription>
      </DialogHeader>

      <LoginOptions v-if="step === 'choose'" @choose="start" />
      <Spinner v-else-if="step === 'signing'" show-label label="Sign in with the other account in the new window." />
      <Spinner v-else-if="step === 'loading'" show-label label="Reading the other account…" />
      <div v-else-if="stepTile && step !== 'attached'" class="flex items-start gap-3">
        <IconTile :icon="stepTile.icon" :tone="stepTile.tone" />
        <p v-if="step === 'unregistered'" class="text-sm text-muted-foreground">
          This sign-in has no account yet. Attach it, and it opens this account from now on.
        </p>
        <p v-else-if="step === 'copy-vault'" class="text-sm text-muted-foreground">
          {{ name }} has a vault with keys. Copy it to this account to go on. It keeps its passphrase.
        </p>
        <p v-else class="text-sm text-muted-foreground">
          <template v-if="other?.ownVault">
            Both accounts have a vault. Sign in with {{ name }}, move its entries to this account in the vault view, then delete its vault.
          </template>
          <template v-else>
            The vault of {{ name }} has changes from two browsers. Sign in with it and unlock its vault once, then try again.
          </template>
        </p>
      </div>
      <template v-else-if="(step === 'confirm' || step === 'merging') && other">
        <div class="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <IconTile :icon="UserRound" tone="muted" />
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium text-foreground">{{ name }}</div>
            <div class="truncate font-mono text-xs text-muted-foreground" :title="other.info.user.user_id">
              {{ other.info.user.user_id }}
            </div>
          </div>
          <ArrowRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <IconTile :icon="UserRound" tone="royal" />
          <div class="text-sm font-medium text-foreground">This account</div>
        </div>
        <section aria-labelledby="merge-moves">
          <h3 id="merge-moves" class="mb-2 text-sm font-medium text-foreground">Moves to this account</h3>
          <ul class="grid gap-3 sm:grid-cols-2">
            <li v-for="item in moves" :key="item.label" class="flex items-center gap-3">
              <IconTile :icon="item.icon" size="sm" />
              <div class="min-w-0">
                <div class="type-label">{{ item.label }}</div>
                <div class="text-sm text-foreground">{{ item.value }}</div>
              </div>
            </li>
          </ul>
        </section>
        <section aria-labelledby="merge-ends">
          <h3 id="merge-ends" class="mb-2 text-sm font-medium text-foreground">Ends</h3>
          <ul class="flex flex-wrap gap-x-5 gap-y-2">
            <li v-for="item in ends" :key="item.label" class="flex items-center gap-2 text-sm text-muted-foreground">
              <IconTile :icon="item.icon" tone="failed" size="sm" />
              {{ item.label }}
            </li>
          </ul>
        </section>
        <Notice v-if="loginOld">You confirm with your own login first.</Notice>
      </template>
      <template v-else-if="step === 'merged'">
        <div class="flex items-center gap-3">
          <IconTile :icon="CircleCheck" tone="ok" />
          <p class="text-sm text-muted-foreground">Everything below now belongs to this account.</p>
        </div>
        <ul class="grid gap-3 sm:grid-cols-2">
          <li v-for="item in outcome" :key="item.label" class="flex items-center gap-3">
            <IconTile :icon="item.icon" tone="ok" size="sm" />
            <div class="min-w-0">
              <div class="type-label">{{ item.label }}</div>
              <div class="text-sm text-foreground">{{ item.value }}</div>
            </div>
          </li>
        </ul>
        <Notice v-if="result?.attributes_not_copied.length" tone="warning" title="Not copied, this account has no room">
          {{ result.attributes_not_copied.join(', ') }}
        </Notice>
      </template>
      <div v-else-if="step === 'attached'" class="flex items-center gap-3">
        <IconTile :icon="CircleCheck" tone="ok" />
        <p class="text-sm text-muted-foreground">You can now sign in with it.</p>
      </div>

      <template v-if="ownLogin">
        <Notice v-if="step === 'unregistered'">You confirm with your own login first.</Notice>
        <LoginOptions @choose="(login) => (step === 'unregistered' ? attach(login) : merge(login))" />
      </template>

      <Notice v-if="failure" tone="error">{{ failure }}</Notice>

      <DialogFooter>
        <template v-if="step === 'merged' || step === 'attached'">
          <Button @click="cancel">Done</Button>
        </template>
        <template v-else>
          <Button variant="outline" @click="cancel">{{ step === 'vault-blocked' || step === 'idle' ? 'Close' : 'Cancel' }}</Button>
          <Button v-if="step === 'unregistered' && !ownLogin" @click="attach()">Attach sign-in</Button>
          <Button v-else-if="step === 'copy-vault'" @click="copyVault">Copy vault</Button>
          <Button v-else-if="(step === 'confirm' || step === 'merging') && !ownLogin" :disabled="busy" @click="merge()">
            <Spinner v-if="step === 'merging'" class="text-current" aria-hidden="true" /> Merge
          </Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
