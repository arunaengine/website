<script setup lang="ts">
// The popup page another realm's portal opens here, at the user's home realm. It takes
// requests only from its opener, checks the opener's signed descriptor and answers only
// that portal's origin. It never navigates away, so the opener link survives a login.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import LoginConsent from '@/components/federation/LoginConsent.vue'
import ExportChoice from '@/components/federation/ExportChoice.vue'
import { useAruna } from '@/composables/useAruna'
import { TOKEN_KEY } from '@/composables/aruna/state'
import { apiErrorMessage, createLoginHandoff, getRealmDescriptor } from '@/lib/api'
import { realmIdText } from '@/lib/federation/descriptor'
import { OpenerLink, type OpenerRequest } from '@/lib/federation/handshake'
import { RequestError, acceptOpener, type PopupRequest } from '@/lib/federation/popup'
import type { VerifiedRealm } from '@/lib/federation/descriptor'
import {
  artifactBytes,
  exportFailure,
  exportForIntent,
  pushToDestination,
  type SourceExport,
} from '@/composables/useSourceExport'
import { Globe2, LogIn, ExternalLink } from '@lucide/vue'

const aruna = useAruna()
const { currentUser, realm, authToken, setAuthToken, refresh, bootstrapped } = aruna

const link = shallowRef<OpenerLink | null>(null)
const request = shallowRef<OpenerRequest | null>(null)
const body = shallowRef<PopupRequest | null>(null)
const serving = shallowRef<VerifiedRealm | null>(null)
const failure = ref<string | null>(null)
const busy = ref(false)
const homeName = ref('')
const sent = ref(false)
let ended = false
const homeId = computed(() => realm.value.id)

// Only a local account of this realm can log in elsewhere; a session from another realm cannot.
const localUser = computed(() => {
  const user = currentUser.value
  return user && user.id.endsWith(`@${homeId.value}`) ? user : null
})

function onStorage(event: StorageEvent) {
  if (event.key !== TOKEN_KEY) return
  setAuthToken(event.newValue ?? '')
  void refresh()
}

async function loadHome() {
  await refresh()
  try {
    const own = await getRealmDescriptor()
    if (realmIdText(own.payload.realm_id) === homeId.value) homeName.value = own.payload.name
  } catch {
    // The realm name from the realm info stays.
  }
}

onMounted(async () => {
  window.addEventListener('storage', onStorage)
  const opener = new OpenerLink(window)
  if (!opener.hasOpener) {
    failure.value = 'Open this page from the portal of another realm.'
    opener.dispose()
    return
  }
  link.value = opener
  await loadHome()
  opener.announce()
  const first = await opener.next()
  try {
    const accepted = await acceptOpener(first, homeId.value)
    opener.lock(first.origin)
    if (accepted.body.kind === 'export' && realmIdText(accepted.body.intent?.payload?.realm_id ?? '') !== accepted.realm.realmId) {
      opener.refuse(first, 'The import request does not match its realm.')
      throw new RequestError('The import request does not match its realm.')
    }
    request.value = first
    body.value = accepted.body
    serving.value = accepted.realm
  } catch (error) {
    failure.value = error instanceof RequestError ? error.message : 'This request cannot be used.'
  }
})

onBeforeUnmount(() => {
  ended = true
  window.removeEventListener('storage', onStorage)
  link.value?.dispose()
})

function openLogin() {
  window.open('/app', '_blank', 'noopener')
}

async function sendExport(choice: { documentId: string; files: string[] }) {
  const current = request.value
  const asked = body.value
  const opener = link.value
  if (!opener || !current || asked?.kind !== 'export') return
  busy.value = true
  failure.value = null
  const token = authToken.value
  const source: SourceExport = {
    descriptor: asked.descriptor,
    intent: asked.intent,
    client: { baseUrl: aruna.apiBaseUrl.value, token },
  }
  const alive = () => !ended && authToken.value === token
  try {
    const { jobId, grant } = await exportForIntent(source, choice.documentId, choice.files, alive)
    if (!alive()) return
    opener.reply(current, { grant, files: choice.files.length })
    sent.value = true
    await serveFollowUps(opener, source, jobId, choice.files.length)
  } catch (error) {
    failure.value = exportFailure(error, homeName.value || realm.value.name)
    opener.refuse(current, failure.value)
  } finally {
    busy.value = false
  }
}

// After the grant the other realm may ask for a push, or for the metadata file itself.
async function serveFollowUps(opener: OpenerLink, source: SourceExport, jobId: string, files: number) {
  while (!ended) {
    const next = await opener.next()
    const asked = next.body as PopupRequest | undefined
    try {
      if (asked?.kind === 'push') opener.reply(next, await pushToDestination(source, jobId))
      else if (asked?.kind === 'artifact' && files === 0) opener.reply(next, await artifactBytes(jobId, source.client))
      else opener.refuse(next, 'This request is not supported.')
    } catch (error) {
      opener.refuse(next, exportFailure(error, homeName.value || realm.value.name))
    }
  }
}

function cancel() {
  if (link.value && request.value) link.value.refuse(request.value, 'Cancelled.')
  window.close()
}

async function allowLogin() {
  const current = request.value
  const asked = body.value
  if (!link.value || !current || asked?.kind !== 'login') return
  busy.value = true
  failure.value = null
  const token = authToken.value
  try {
    const handoff = await createLoginHandoff(asked.descriptor, asked.nonce, { baseUrl: aruna.apiBaseUrl.value, token })
    if (token !== authToken.value) return
    link.value.reply(current, handoff)
    window.close()
  } catch (error) {
    failure.value = apiErrorMessage(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex min-h-full justify-center bg-background px-4 py-6">
    <div class="surface w-full max-w-md self-start overflow-hidden">
      <header class="flex items-center gap-2 border-b border-border px-5 py-3">
        <span class="grid h-6 w-6 place-items-center rounded text-white" :style="{ backgroundColor: realm.color }">
          <Globe2 class="h-3.5 w-3.5" />
        </span>
        <div class="min-w-0 leading-tight">
          <p class="truncate text-sm font-semibold text-foreground">{{ homeName || realm.name }}</p>
          <p class="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Realm {{ homeId.slice(0, 8) }}</p>
        </div>
      </header>
      <div class="p-5">
        <Notice v-if="failure" tone="error">{{ failure }}</Notice>
        <Spinner v-else-if="!serving || !bootstrapped" show-label label="Waiting for the other realm…" class="justify-center py-6 text-sm" />
        <div v-else-if="!localUser" class="flex flex-col items-center gap-3 py-2 text-center">
          <span class="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary"><LogIn class="h-5 w-5" /></span>
          <h1 class="font-display text-base font-semibold text-foreground">Log in to {{ homeName || realm.name }} first</h1>
          <p class="text-sm text-muted-foreground">Then come back to this window.</p>
          <Button class="w-full" @click="openLogin"><ExternalLink class="h-4 w-4" /> Open login in a new tab</Button>
          <Spinner show-label label="Waiting for you to log in…" class="text-xs" />
        </div>
        <LoginConsent
          v-else-if="body?.kind === 'login'"
          :home="{ realmId: homeId, name: homeName || realm.name }"
          :serving="serving"
          :user="localUser"
          :busy="busy"
          :linking="body.link"
          @allow="allowLogin"
          @cancel="cancel"
        />
        <Notice v-else-if="sent" tone="success">
          Sent to {{ serving.name }}. Keep this window open until the import has started.
        </Notice>
        <ExportChoice
          v-else-if="body?.kind === 'export'"
          :serving="serving"
          :home-name="homeName || realm.name"
          :busy="busy"
          @send="sendExport"
          @cancel="cancel"
        />
      </div>
    </div>
  </div>
</template>
