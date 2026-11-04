<script setup lang="ts">
// Other logins for the same identity provider account. The provider keeps the list; the portal
// links a configured login by sending the signed-in person through it once with its link params.
import AccountMerge from '@/components/auth/AccountMerge.vue'
import ProviderLogo from '@/components/auth/ProviderLogo.vue'
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import Notice from '@/components/ui/Notice.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { homeRealmLabel } from '@/composables/useFederation'
import { portalConfig } from '@/lib/config'
import { LogIn } from '@lucide/vue'

const { currentUser, realm } = useAruna()
const { linkProvider, providerLink, stage } = useAuth()

const { options, accountUrl } = portalConfig().login
// An upstream login has no Keycloak account to link to; the account merge joins it instead.
const linkable = options.filter((option) => !option.upstream && Object.keys(option.linkParams).length)
// A session from another realm has no account at this realm's Keycloak.
const shown = computed(() => {
  const user = currentUser.value
  return Boolean(user) && !homeRealmLabel(user!.id, realm.value.id)
})
const busy = computed(() => stage.value === 'redirecting')
</script>

<template>
  <section v-if="shown" aria-labelledby="provider-links-title">
    <SectionHeading id="provider-links-title" title="Linked logins" :icon="LogIn" />
    <div class="surface overflow-hidden">
      <template v-if="linkable.length">
        <p class="px-5 py-4 text-sm text-muted-foreground">
          Link another login to this account. You sign in with it once to confirm.
        </p>
        <ul class="divide-y divide-border border-t border-border">
          <li v-for="provider in linkable" :key="provider.name" class="flex items-center gap-3 px-5 py-3">
            <ProviderLogo :logo="provider.logo" :logo-light="provider.logoLight" />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-foreground">{{ provider.name }}</div>
              <div class="text-xs text-muted-foreground">{{ provider.description }}</div>
            </div>
            <Button size="sm" variant="outline" :aria-label="`Link ${provider.name}`" :disabled="busy" @click="linkProvider(provider)">
              Link
            </Button>
          </li>
        </ul>
        <Notice v-if="providerLink" :tone="providerLink.linked ? 'success' : 'error'" class="mx-5 mb-3">
          <template v-if="providerLink.linked">{{ providerLink.name }} is linked. You can now sign in with it.</template>
          <template v-else>{{ providerLink.name }} was not linked. {{ providerLink.message }}</template>
        </Notice>
        <p class="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          Logins you already linked are not shown here.
          <ExternalLink v-if="accountUrl" :href="accountUrl" :show-icon="false">See or remove them in your account</ExternalLink>
        </p>
      </template>
      <AccountMerge />
    </div>
  </section>
</template>
