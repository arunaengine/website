<script setup lang="ts">
// The login chooser: the configured logins, or the realm's plain sign-in.
import { computed } from 'vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import ProviderLogo from '@/components/auth/ProviderLogo.vue'
import { signInChoice } from '@/composables/signInChoice'
import { useAuth } from '@/composables/useAuth'
import { portalConfig, type LoginOption } from '@/lib/config'

const { signIn } = useAuth()

const PLAIN_SIGN_IN: LoginOption = {
  name: 'Realm account',
  description: 'Sign in at this realm',
  logo: '/brand/providers/aruna.webp',
  params: {},
  linkParams: {},
}
const configured = portalConfig().login.options
const choices = configured.length ? configured : [PLAIN_SIGN_IN]
const rowClass =
  'flex w-full items-center justify-center gap-3 rounded-md border border-border px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-muted/50'

const open = computed({
  get: () => signInChoice.value !== null,
  set: (value: boolean) => {
    if (!value) signInChoice.value = null
  },
})

function choose(choice: LoginOption) {
  const options = signInChoice.value
  if (!options) return
  signInChoice.value = null
  const params = Object.keys(choice.params).length ? choice.params : undefined
  void signIn(params ? { ...options, params } : options)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle class="text-center">Continue login with</DialogTitle>
        <DialogDescription class="sr-only">Choose how you want to sign in.</DialogDescription>
      </DialogHeader>
      <ul class="flex flex-col gap-2.5">
        <li v-for="choice in choices" :key="choice.name">
          <button type="button" :title="choice.description || undefined" :class="rowClass" @click="choose(choice)">
            <ProviderLogo :logo="choice.logo" :logo-light="choice.logoLight" />
            <span class="w-36 text-left">{{ choice.name }}</span>
          </button>
        </li>
      </ul>
      <p class="text-xs leading-relaxed text-muted-foreground">
        New login with the email of an existing account? You sign in once with that account to link both.
      </p>
    </DialogContent>
  </Dialog>
</template>
