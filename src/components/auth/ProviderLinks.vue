<script setup lang="ts">
// Other logins for the same Keycloak account. Keycloak keeps the list; the portal links
// a login by sending the signed-in person through it once (Keycloak's idp_link action).
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
import { LOGIN_PROVIDERS, linkedAccountsUrl, offersProviders } from '@/lib/loginProviders'
import { LogIn } from '@lucide/vue'

const { currentUser, realm, realmInfo } = useAruna()
const { linkProvider, providerLink, stage } = useAuth()

const issuer = computed(() => realmInfo.value?.oidc_providers[0]?.issuer)
// A session from another realm has no account at this realm's Keycloak.
const shown = computed(() => {
  const user = currentUser.value
  return Boolean(user) && !homeRealmLabel(user!.id, realm.value.id)
})
const providers = computed(() => offersProviders(issuer.value))
const busy = computed(() => stage.value === 'redirecting')
</script>

<template>
  <section v-if="shown" aria-labelledby="provider-links-title">
    <SectionHeading id="provider-links-title" title="Linked logins" :icon="LogIn" />
    <div class="surface overflow-hidden">
      <template v-if="providers">
        <p class="px-5 py-4 text-sm text-muted-foreground">
          Link another login to this account. You sign in with it once to confirm.
        </p>
        <ul class="divide-y divide-border border-t border-border">
          <li v-for="provider in LOGIN_PROVIDERS" :key="provider.alias" class="flex items-center gap-3 px-5 py-3">
            <ProviderLogo :logo="provider.logo" :logo-light="provider.logoLight" />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-foreground">{{ provider.name }}</div>
              <div class="text-xs text-muted-foreground">{{ provider.description }}</div>
            </div>
            <Button size="sm" variant="outline" :aria-label="`Link ${provider.name}`" :disabled="busy" @click="linkProvider(provider.alias)">
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
          <ExternalLink :href="linkedAccountsUrl(issuer!)" :show-icon="false">See or remove them in your account</ExternalLink>
        </p>
      </template>
      <AccountMerge />
    </div>
  </section>
</template>
