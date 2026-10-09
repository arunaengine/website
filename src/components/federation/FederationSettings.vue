<script setup lang="ts">
// Realm federation settings: who can find this realm and who may log in from other realms.
// The node only serves the public descriptor, so the registry and login choices are known
// here only after a save in this page.
import { computed, onMounted, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Switch from '@/components/ui/Switch.vue'
import RealmTag from '@/components/federation/RealmTag.vue'
import { useAruna } from '@/composables/useAruna'
import {
  ApiError,
  apiErrorMessage,
  getRealmDescriptor,
  setRealmFederation,
  type RealmFederationSettings,
} from '@/lib/api'
import { checkRealm, knownRealm } from '@/lib/federation/realms'
import { assertCurrentSession, refreshContext } from '@/composables/aruna/state'
import { Plus, Save, X } from '@lucide/vue'

const { realm } = useAruna()

const name = ref('')
const apiUrl = ref('')
const portalUrl = ref('')
const registryUrl = ref('')
const listed = ref(true)
const mode = ref<'none' | 'only' | 'any'>('none')
const realms = ref<string[]>([])
const address = ref('')
const loading = ref(true)
// Registry and login choices are unknown until this page saved them once.
const choicesKnown = ref(false)
const saving = ref(false)
const adding = ref(false)
const failure = ref<string | null>(null)
const saved = ref(false)

const ready = computed(() => Boolean(name.value.trim() && apiUrl.value.trim() && portalUrl.value.trim()))

onMounted(async () => {
  const context = refreshContext()
  try {
    const descriptor = await getRealmDescriptor(context.client)
    assertCurrentSession(context.epoch)
    name.value = descriptor.payload.name
    apiUrl.value = descriptor.payload.api_url
    portalUrl.value = descriptor.payload.portal_url
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) failure.value = apiErrorMessage(error)
  } finally {
    loading.value = false
  }
})

function apply(stored: RealmFederationSettings) {
  name.value = stored.name
  apiUrl.value = stored.api_url
  portalUrl.value = stored.portal_url
  registryUrl.value = stored.registry_url ?? ''
  listed.value = stored.registration === 'enabled'
  mode.value = stored.accepted_realms.mode
  realms.value = stored.accepted_realms.mode === 'only' ? [...stored.accepted_realms.realms] : []
  choicesKnown.value = true
}

async function addRealm() {
  const value = address.value.trim()
  if (!value) return
  adding.value = true
  failure.value = null
  const result = await checkRealm(value)
  adding.value = false
  if (result.status !== 'ok') {
    failure.value = result.message
    return
  }
  if (result.realm.realmId === realm.value.id) failure.value = 'This is this realm.'
  else if (!realms.value.includes(result.realm.realmId)) realms.value = [...realms.value, result.realm.realmId]
  address.value = ''
}

async function save() {
  saving.value = true
  failure.value = null
  saved.value = false
  const context = refreshContext()
  try {
    const stored = await setRealmFederation(
      {
        name: name.value.trim(),
        api_url: apiUrl.value.trim(),
        portal_url: portalUrl.value.trim(),
        registry_url: registryUrl.value.trim() || null,
        registration: listed.value ? 'enabled' : 'disabled',
        accepted_realms: mode.value === 'only' ? { mode: 'only', realms: realms.value } : { mode: mode.value },
      },
      context.client,
    )
    assertCurrentSession(context.epoch)
    apply(stored)
    saved.value = true
  } catch (error) {
    failure.value = apiErrorMessage(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="surface overflow-hidden" aria-labelledby="federation-settings-title">
    <header class="border-b border-border px-5 py-4">
      <h3 id="federation-settings-title" class="font-display text-sm font-semibold text-aruna-navy">Federation</h3>
      <p class="text-xs text-muted-foreground">Let people from other realms find and use this realm.</p>
    </header>
    <Spinner v-if="loading" show-label label="Loading…" class="p-5 text-sm" />
    <div v-else class="space-y-5 p-5">
      <Notice v-if="!choicesKnown">
        The current registry and login choices cannot be read here. Saving sets them as shown.
      </Notice>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="federation-name" class="text-xs font-medium text-foreground">Name</label>
          <Input id="federation-name" v-model="name" class="mt-1" />
        </div>
        <div>
          <label for="federation-portal" class="text-xs font-medium text-foreground">Portal address</label>
          <Input id="federation-portal" v-model="portalUrl" placeholder="https://portal.example.org" class="mt-1" />
        </div>
        <div>
          <label for="federation-api" class="text-xs font-medium text-foreground">Public API address</label>
          <Input id="federation-api" v-model="apiUrl" placeholder="https://api.example.org/api/v1" class="mt-1" />
        </div>
        <div>
          <label for="federation-registry" class="text-xs font-medium text-foreground">Registry address (optional)</label>
          <Input id="federation-registry" v-model="registryUrl" placeholder="https://registry.example.org" class="mt-1" />
          <p class="mt-1 text-[11px] text-muted-foreground">Leave blank to skip the registry.</p>
        </div>
      </div>
      <div class="flex items-start gap-3">
        <Switch
          :checked="listed && Boolean(registryUrl.trim())"
          :disabled="!registryUrl.trim()"
          aria-label="List this realm in the registry"
          @update:checked="listed = $event"
        />
        <div>
          <p class="text-sm font-medium text-foreground">List this realm in the registry</p>
          <p class="text-[11px] text-muted-foreground">
            {{ registryUrl.trim() ? 'Others can find it by name.' : 'Add a registry address first.' }}
          </p>
        </div>
      </div>
      <fieldset class="space-y-2">
        <legend class="mb-1.5 text-xs font-medium text-foreground">Who may log in from other realms</legend>
        <label class="flex items-center gap-2.5 text-sm"><input v-model="mode" type="radio" value="none" /> Nobody</label>
        <label class="flex items-center gap-2.5 text-sm"><input v-model="mode" type="radio" value="only" /> Only these realms</label>
        <div v-if="mode === 'only'" class="ml-6 space-y-2">
          <div v-for="realmId in realms" :key="realmId" class="flex items-center gap-2">
            <RealmTag :realm-id="realmId" :name="knownRealm(realmId)?.name" />
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground"
              :aria-label="`Remove ${knownRealm(realmId)?.name ?? realmId}`"
              @click="realms = realms.filter((entry) => entry !== realmId)"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
          <form class="flex gap-2" @submit.prevent="addRealm">
            <label for="federation-realm-address" class="sr-only">Realm address</label>
            <Input id="federation-realm-address" v-model="address" placeholder="https://realm.example.org" />
            <Button type="submit" variant="outline" :disabled="!address.trim() || adding">
              <Spinner v-if="adding" class="text-current" aria-hidden="true" /><Plus v-else class="h-4 w-4" /> Add
            </Button>
          </form>
        </div>
        <label class="flex items-start gap-2.5 text-sm">
          <input v-model="mode" type="radio" value="any" class="mt-1" />
          <span>Any realm<span class="block text-[11px] text-muted-foreground">Anyone with a realm can log in here.</span></span>
        </label>
      </fieldset>
      <Notice v-if="failure" tone="error">{{ failure }}</Notice>
      <Notice v-else-if="saved" tone="success">Saved.</Notice>
    </div>
    <footer class="flex justify-end border-t border-border bg-muted/30 px-5 py-3">
      <Button :disabled="!ready || saving || loading" @click="save">
        <Spinner v-if="saving" class="text-current" aria-hidden="true" /><Save v-else class="h-4 w-4" /> Save
      </Button>
    </footer>
  </section>
</template>
