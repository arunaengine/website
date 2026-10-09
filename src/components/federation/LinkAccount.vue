<script setup lang="ts">
// The link step after the local login: a fresh popup at the home realm, then an explicit
// confirmation that shows both accounts before anything is linked.
import { computed, ref, shallowRef } from 'vue'
import Avatar from '@/components/ui/Avatar.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import RealmTag from '@/components/federation/RealmTag.vue'
import { useAruna } from '@/composables/useAruna'
import { homeRealmLabel } from '@/composables/useFederation'
import { confirmLink, finishLink, linkFailure, pendingLink, setPendingLink } from '@/composables/useLinking'
import type { LinkConfirmation } from '@/lib/api'
import { userIdText, type Signed } from '@/lib/federation/descriptor'
import { knownRealm } from '@/lib/federation/realms'
import { Link2 } from '@lucide/vue'

const { currentUser, realm, apiBaseUrl } = useAruna()

const home = computed(() => {
  const pending = pendingLink.value
  if (!pending || pending.apiBaseUrl !== apiBaseUrl.value) return null
  return knownRealm(pending.homeRealmId) ?? null
})
// Linking needs the local account; a session of another realm cannot link.
const localUser = computed(() =>
  currentUser.value && !homeRealmLabel(currentUser.value.id, realm.value.id) ? currentUser.value : null,
)
const confirmation = shallowRef<Signed<LinkConfirmation> | null>(null)
const foreignName = ref<string | null>(null)
const busy = ref<'' | 'asking' | 'linking'>('')
const failure = ref<string | null>(null)
const done = ref(false)
const foreignUser = computed(() => (confirmation.value ? userIdText(confirmation.value.payload.foreign_user) : ''))

async function ask() {
  const target = home.value
  if (!target) return
  busy.value = 'asking'
  failure.value = null
  try {
    const confirmed = await confirmLink(target)
    confirmation.value = confirmed.confirmation
    foreignName.value = confirmed.name
  } catch (error) {
    failure.value = linkFailure(error)
  } finally {
    busy.value = ''
  }
}

async function link() {
  if (!confirmation.value) return
  busy.value = 'linking'
  failure.value = null
  try {
    await finishLink(confirmation.value)
    confirmation.value = null
    done.value = true
  } catch (error) {
    failure.value = linkFailure(error)
  } finally {
    busy.value = ''
  }
}

function cancel() {
  confirmation.value = null
  setPendingLink(null)
}
</script>

<template>
  <Notice v-if="done" tone="success">Your accounts are linked.</Notice>
  <section v-else-if="home && localUser" class="surface overflow-hidden" aria-labelledby="link-account-title">
    <header class="border-b border-border px-5 py-4">
      <h3 id="link-account-title" class="flex items-center gap-2 font-display text-sm font-semibold text-aruna-navy">
        <Link2 class="h-4 w-4 text-primary" />
        {{ confirmation ? `Link ${foreignName || foreignUser} to your account here?` : `Link a login of ${home.name}` }}
      </h3>
    </header>
    <div class="space-y-4 p-5">
      <template v-if="!confirmation">
        <p class="text-sm text-muted-foreground">Confirm it in a {{ home.name }} window.</p>
      </template>
      <template v-else>
        <div class="flex flex-wrap items-center gap-2">
          <RealmTag :realm-id="home.realmId" :name="home.name" />
          <span class="font-mono text-[11px] text-muted-foreground" :title="foreignUser">{{ foreignUser }}</span>
        </div>
        <div class="flex items-center gap-3 rounded-md bg-muted/60 px-3 py-2">
          <Avatar :user="localUser" size="md" />
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-foreground">{{ localUser.name }}</p>
            <p class="truncate text-[11px] text-muted-foreground">{{ realm.name }}</p>
          </div>
        </div>
        <ul class="list-disc space-y-1 pl-5 text-sm text-foreground/90">
          <li>Logging in through {{ home.name }} opens this account.</li>
          <li>Access given to {{ foreignName || foreignUser }} is not moved.</li>
          <li>{{ home.name }} can then log you in to this account.</li>
        </ul>
      </template>
      <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    </div>
    <footer class="flex justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
      <Button variant="outline" :disabled="Boolean(busy)" @click="cancel">Cancel</Button>
      <Button v-if="!confirmation" :disabled="Boolean(busy)" @click="ask">
        <Spinner v-if="busy === 'asking'" class="text-current" aria-hidden="true" /> Continue at {{ home.name }}
      </Button>
      <Button v-else :disabled="Boolean(busy)" @click="link">
        <Spinner v-if="busy === 'linking'" class="text-current" aria-hidden="true" /> Link
      </Button>
    </footer>
  </section>
</template>
