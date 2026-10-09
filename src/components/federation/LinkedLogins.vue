<script setup lang="ts">
// Logins of other realms that open this account, with removal. A user who came from
// another realm gets the link action here instead.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import RealmTag from '@/components/federation/RealmTag.vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { homeRealmLabel } from '@/composables/useFederation'
import { linkFailure, removeLogin, setPendingLink } from '@/composables/useLinking'
import { knownRealm } from '@/lib/federation/realms'
import { Link2 } from '@lucide/vue'

const { currentUser, userInfo, realm, apiBaseUrl } = useAruna()
const { signIn } = useAuth()

const foreign = computed(() => Boolean(currentUser.value && homeRealmLabel(currentUser.value.id, realm.value.id)))
const logins = computed(() =>
  (userInfo.value?.linked_logins ?? []).map((login) => {
    const realmId = login.split('@')[1] ?? ''
    return { login, realmId, name: knownRealm(realmId)?.name }
  }),
)
const removing = ref('')
const failure = ref<string | null>(null)

async function remove(login: string) {
  const user = currentUser.value
  if (!user) return
  removing.value = login
  failure.value = null
  try {
    await removeLogin(user.id, login)
  } catch (error) {
    failure.value = linkFailure(error)
  } finally {
    removing.value = ''
  }
}

function linkHere() {
  const homeRealmId = currentUser.value?.id.split('@')[1]
  if (!homeRealmId) return
  setPendingLink({ apiBaseUrl: apiBaseUrl.value, homeRealmId })
  void signIn({ redirectTo: '/app/settings' })
}
</script>

<template>
  <section class="surface overflow-hidden" aria-labelledby="linked-logins-title">
    <header class="border-b border-border px-5 py-4">
      <h3 id="linked-logins-title" class="flex items-center gap-2 font-display text-sm font-semibold text-aruna-navy">
        <Link2 class="h-4 w-4 text-primary" /> Linked logins
      </h3>
    </header>
    <div v-if="foreign" class="flex flex-wrap items-center justify-between gap-3 p-5">
      <p class="text-sm text-muted-foreground">Have an account here too? Log in to link it.</p>
      <Button size="sm" @click="linkHere">Link to my account here</Button>
    </div>
    <p v-else-if="!logins.length" class="p-5 text-sm text-muted-foreground">No linked logins.</p>
    <ul v-else class="divide-y divide-border">
      <li v-for="entry in logins" :key="entry.login" class="flex flex-wrap items-center gap-3 px-5 py-3">
        <RealmTag :realm-id="entry.realmId" :name="entry.name" />
        <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" :title="entry.login">{{ entry.login }}</span>
        <Button size="sm" variant="outline" :disabled="Boolean(removing)" @click="remove(entry.login)">Remove</Button>
      </li>
    </ul>
    <Notice v-if="failure" tone="error" class="mx-5 mb-3">{{ failure }}</Notice>
    <footer v-if="!foreign && logins.length" class="border-t border-border bg-muted/30 px-5 py-2.5 text-xs text-muted-foreground">
      Removing it ends its open sessions.
    </footer>
  </section>
</template>
