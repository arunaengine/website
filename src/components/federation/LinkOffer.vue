<script setup lang="ts">
// After a login through another realm: offer to link a local account here. A name match
// only changes the words; it never picks an account.
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { dismissLinkOffer, federatedLogin, homeRealmLabel } from '@/composables/useFederation'
import { setPendingLink } from '@/composables/useLinking'
import { Link2 } from '@lucide/vue'

const { currentUser, realm, apiBaseUrl } = useAruna()
const { signIn } = useAuth()

const offer = computed(() => {
  const login = federatedLogin.value
  const user = currentUser.value
  if (!login || login.dismissed || login.linked || !user) return null
  if (login.apiBaseUrl !== apiBaseUrl.value || !homeRealmLabel(user.id, realm.value.id)) return null
  return login
})

function linkHere() {
  const login = offer.value
  if (!login) return
  setPendingLink({ apiBaseUrl: login.apiBaseUrl, homeRealmId: login.homeRealmId })
  dismissLinkOffer()
  // Linking needs a login made just now, not an older one the provider remembers.
  void signIn({ redirectTo: '/app/settings', freshLogin: true })
}
</script>

<template>
  <div v-if="offer" class="container mt-4">
  <section class="surface flex flex-wrap items-center gap-4 border-primary/40 px-5 py-4" aria-labelledby="link-offer-title">
    <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Link2 class="h-4 w-4" /></span>
    <div class="min-w-0 flex-1">
      <h2 id="link-offer-title" class="text-sm font-semibold text-foreground">
        {{ offer.accountHint ? 'You may already have an account here.' : 'Do you have an account here too?' }}
      </h2>
      <p class="text-xs text-muted-foreground">Log in to link it.</p>
    </div>
    <Button size="sm" @click="linkHere">Link to my account here</Button>
    <Button size="sm" variant="ghost" @click="dismissLinkOffer">Not now</Button>
  </section>
  </div>
</template>
