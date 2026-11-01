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
import { ChevronRight } from '@lucide/vue'

const { signIn } = useAuth()

const choices = [
  ...LOGIN_PROVIDERS,
  { alias: '', name: 'Aruna account', description: 'Username and password' },
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
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>Sign in</DialogTitle>
        <DialogDescription>Choose how you want to sign in.</DialogDescription>
      </DialogHeader>
      <ul class="divide-y divide-border overflow-hidden rounded-md border border-border">
        <li v-for="choice in choices" :key="choice.alias || 'aruna'">
          <button
            type="button"
            class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
            @click="choose(choice.alias)"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-foreground">{{ choice.name }}</span>
              <span class="block text-xs text-muted-foreground">{{ choice.description }}</span>
            </span>
            <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      </ul>
      <p class="text-xs leading-relaxed text-muted-foreground">
        New login with the email of an existing account? You sign in once with that account to link both.
      </p>
    </DialogContent>
  </Dialog>
</template>
