<script setup lang="ts">
// The login chooser for realms on the Aruna Keycloak; the plain account needs no hint.
import { computed } from 'vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import { signInChoice } from '@/composables/signInChoice'
import { useAuth } from '@/composables/useAuth'
import { LOGIN_PROVIDERS } from '@/lib/loginProviders'
import iconMark from '@/assets/brand/icon-mark.avif'
import ProviderLogo from '@/components/auth/ProviderLogo.vue'

const { signIn } = useAuth()

const choices = [
  ...LOGIN_PROVIDERS,
  { alias: '', name: 'Aruna (legacy)', description: 'Aruna username and password', logo: iconMark, logoLight: undefined },
]

const open = computed({
  get: () => signInChoice.value !== null,
  set: (value: boolean) => {
    if (!value) signInChoice.value = null
  },
})

function choose(alias: string) {
  const options = signInChoice.value
  if (!options) return
  signInChoice.value = null
  void signIn(alias ? { ...options, idpHint: alias } : options)
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
        <li v-for="choice in choices" :key="choice.alias || 'aruna'">
          <button
            type="button"
            :title="choice.description"
            class="flex w-full items-center justify-center gap-3 rounded-md border border-border px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-muted/50"
            @click="choose(choice.alias)"
          >
            <ProviderLogo :logo="choice.logo" :logo-light="choice.logoLight" :large="!choice.alias" />
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
