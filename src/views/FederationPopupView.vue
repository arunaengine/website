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
import { currentTokenKey } from '@/composables/aruna/state'
import { ApiError, apiErrorMessage, createLoginHandoff, getRealmDescriptor } from '@/lib/api'
import { realmIdText } from '@/lib/federation/descriptor'
import { OpenerLink, type OpenerRequest } from '@/lib/federation/handshake'
import { IMPORT_TIMEOUT_MS, RequestError, acceptOpener, type PopupRequest } from '@/lib/federation/popup'
import type { VerifiedRealm } from '@/lib/federation/descriptor'
import {
  ExportStop,
  SESSION_CHANGED,
  exportFailure,
  exportForIntent,
  serveFollowUps,
  type SourceExport,
} from '@/composables/useSourceExport'
import { Globe2, LogIn, ExternalLink } from '@lucide/vue'

const aruna = useAruna()
const { currentUser, realm, setAuthToken, refresh, bootstrapped, sessionEpoch } = aruna

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

// Work for the other realm stays bound to the login and API it started with.
function boundToSession() {
  const epoch = sessionEpoch.value
  const base = aruna.apiBaseUrl.value
  return () => !ended && sessionEpoch.value === epoch && aruna.apiBaseUrl.value === base
}

// Only a local account of this realm can log in elsewhere; a session from another realm cannot.
const localUser = computed(() => {
  const user = currentUser.value
  return user && user.id.endsWith(`@${homeId.value}`) ? user : null
})

function onStorage(event: StorageEvent) {
  if (!event.key || event.key !== currentTokenKey()) return
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
  const opener = new OpenerLink(window, IMPORT_TIMEOUT_MS)
  if (!opener.hasOpener) {
    failure.value = 'Open this page from the portal of another realm.'
    opener.dispose()
    return
  }
  link.value = opener
  await loadHome()
  opener.announce()
  let first: OpenerRequest
  try {
    first = await opener.next()
  } catch (error) {
    if (!ended) failure.value = error instanceof Error ? error.message : 'This request cannot be used.'
    return
  }
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
  const source: SourceExport = {
    descriptor: asked.descriptor,
    intent: asked.intent,
    client: { baseUrl: aruna.apiBaseUrl.value, token: aruna.authToken.value },
  }
  const alive = boundToSession()
  try {
    const { jobId, grant } = await exportForIntent(source, choice.documentId, choice.files, alive)
    if (!alive()) throw new ExportStop(SESSION_CHANGED)
    opener.reply(current, { grant, files: choice.files.length })
    sent.value = true
    const granted = { jobId, grant, files: choice.files.length, alive }
    await serveFollowUps(opener, source, granted, homeName.value || realm.value.name)
  } catch (error) {
    failure.value = exportFailure(error, homeName.value || realm.value.name)
    opener.refuse(current, failure.value, errorCode(error))
  } finally {
    busy.value = false
  }
}

function errorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined
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
  const alive = boundToSession()
  try {
    const client = { baseUrl: aruna.apiBaseUrl.value, token: aruna.authToken.value }
    const handoff = await createLoginHandoff(asked.descriptor, asked.nonce, client)
    if (!alive()) return
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
