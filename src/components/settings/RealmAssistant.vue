<script setup lang="ts">
// The realm assistant an admin sets up for every member: the provider, its key,
// the models members may pick and how many calls each member gets per day.
import { computed, onMounted, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import IconTile from '@/components/ui/IconTile.vue'
import Input from '@/components/ui/Input.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { apiBaseUrl, authToken } from '@/composables/aruna/state'
import { useAssistantProviders } from '@/composables/useAssistantProviders'
import { useUserDirectory } from '@/composables/useUserDirectory'
import {
  ADDABLE_PROVIDER_KINDS,
  PROVIDER_KIND_LABELS,
  SESSION_HEADER,
  apiErrorMessage,
  deleteCentralAssistant,
  getCentralAssistant,
  putCentralAssistant,
  testCentralAssistant,
  type AssistantProviderKind,
  type CentralAssistant,
} from '@/lib/api'
import { formatDateTime, relativeTime } from '@/lib/utils'
import { CircleCheck, CircleX, Clock, PlugZap, RefreshCw, Save, Server, Sparkles, Trash2 } from '@lucide/vue'

const USER_HEADER = 'x-user-id'

const providers = useAssistantProviders()
const { resolveUsers, cachedUser } = useUserDirectory()

const setup = ref<CentralAssistant | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const confirmRemove = ref(false)
const tested = ref<{ ok: boolean; message: string; at: string } | null>(null)

const kind = ref<AssistantProviderKind>('openai_compatible')
const label = ref('Realm assistant')
const baseUrl = ref('')
const apiKey = ref('')
const available = ref<string[]>([])
const allowed = ref<string[]>([])
const defaultModel = ref('')
const dailyLimit = ref('')
const userHeader = ref(USER_HEADER)
const sessionHeader = ref(SESSION_HEADER)

const kindOptions = ADDABLE_PROVIDER_KINDS.map((value) => ({ value, label: PROVIDER_KIND_LABELS[value] }))
const changedBy = computed(() => {
  const id = setup.value?.admin?.changed_by
  return id ? cachedUser(id)?.name ?? id : ''
})

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

function fill(next: CentralAssistant | null) {
  setup.value = next
  apiKey.value = ''
  if (!next) return
  kind.value = next.kind
  label.value = next.label
  baseUrl.value = next.admin?.base_url ?? ''
  allowed.value = next.models.map((model) => model.id)
  available.value = [...new Set([...allowed.value, ...available.value])]
  defaultModel.value = next.default_model ?? ''
  dailyLimit.value = next.daily_limit == null ? '' : String(next.daily_limit)
  userHeader.value = next.admin?.user_header ?? USER_HEADER
  sessionHeader.value = next.admin?.session_header ?? SESSION_HEADER
  if (next.admin) void resolveUsers([next.admin.changed_by])
}

async function run(action: () => Promise<void>) {
  busy.value = true
  error.value = null
  notice.value = null
  try {
    await action()
  } catch (cause) {
    error.value = apiErrorMessage(cause)
  } finally {
    busy.value = false
  }
}

async function test() {
  const result = await testCentralAssistant(client())
  tested.value = { ok: result.ok, message: result.message, at: new Date().toISOString() }
  if (result.ok) available.value = [...new Set([...allowed.value, ...result.models.map((model) => model.id)])]
}

function toggle(id: string) {
  allowed.value = allowed.value.includes(id) ? allowed.value.filter((entry) => entry !== id) : [...allowed.value, id]
  if (!allowed.value.includes(defaultModel.value)) defaultModel.value = allowed.value[0] ?? ''
}

function limitValue(): number | null {
  const text = dailyLimit.value.trim()
  if (!text) return null
  const value = Number(text)
  if (!Number.isInteger(value) || value < 0) throw new Error('The daily limit must be a whole number.')
  return value
}

async function save() {
  await run(async () => {
    const saved = await putCentralAssistant({
      kind: kind.value,
      label: label.value.trim() || 'Realm assistant',
      ...(apiKey.value ? { api_key: apiKey.value } : {}),
      ...(baseUrl.value.trim() ? { base_url: baseUrl.value.trim() } : {}),
      models: allowed.value.map((id) => ({ id })),
      ...(defaultModel.value ? { default_model: defaultModel.value } : {}),
      daily_limit: limitValue(),
      user_header: userHeader.value.trim() || USER_HEADER,
      session_header: sessionHeader.value.trim() || SESSION_HEADER,
    }, client())
    fill(saved)
    notice.value = allowed.value.length ? 'Saved.' : 'Saved. Load the models and allow at least one.'
    void providers.load()
  })
}

async function remove() {
  await run(async () => {
    await deleteCentralAssistant(client())
    confirmRemove.value = false
    tested.value = null
    fill(null)
    notice.value = 'The realm assistant was removed.'
    void providers.load()
  })
}

onMounted(async () => {
  try {
    fill(await getCentralAssistant(client()))
    if (setup.value) await test()
  } catch (cause) {
    error.value = apiErrorMessage(cause)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section>
    <SectionHeading title="Realm assistant" :icon="Sparkles" :level="2" />
    <Spinner v-if="loading" label="Loading the realm assistant" />
    <div v-else class="grid gap-4 lg:grid-cols-3">
      <div class="rounded-xl border border-border-subtle bg-card text-card-foreground shadow-sm dark:shadow-none lg:col-span-2">
        <div class="flex items-start gap-3 px-5 pb-3 pt-5">
          <IconTile :icon="Server" tone="royal" size="lg" />
          <div>
            <h3 class="type-card-title">Provider</h3>
            <p class="mt-0.5 text-sm text-muted-foreground">Every signed-in member can chat with it. No own key needed.</p>
          </div>
        </div>
        <div class="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <label class="space-y-1.5">
            <span class="text-xs font-medium">Kind</span>
            <Select
              :model-value="kind"
              :options="kindOptions"
              aria-label="Kind"
              @update:model-value="(value: string) => (kind = value as AssistantProviderKind)"
            />
          </label>
          <label class="space-y-1.5">
            <span class="text-xs font-medium">Name shown to members</span>
            <Input v-model="label" aria-label="Name shown to members" />
          </label>
          <label class="space-y-1.5">
            <span class="text-xs font-medium">Address</span>
            <Input v-model="baseUrl" class="font-mono" aria-label="Address" placeholder="https://chat.example.org/api" />
            <span v-if="kind === 'openai_compatible'" class="block text-xs text-muted-foreground">
              For Open WebUI, end the address with /api.
            </span>
          </label>
          <label class="space-y-1.5">
            <span class="text-xs font-medium">API key</span>
            <Input
              v-model="apiKey"
              type="password"
              autocomplete="off"
              aria-label="API key"
              :placeholder="setup ? 'Key saved. Type to replace it.' : 'Paste the key'"
            />
          </label>
          <div class="space-y-1.5 sm:col-span-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium">Allowed models</span>
              <Button variant="outline" size="sm" :disabled="busy || !setup" @click="run(test)">
                <RefreshCw class="size-3.5" /> Load models
              </Button>
            </div>
            <p v-if="!available.length" class="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
              {{ setup ? 'Load the models the provider offers.' : 'Save first, then load the models.' }}
            </p>
            <div v-else class="divide-y divide-border rounded-md border border-border">
              <label
                v-for="id in available"
                :key="id"
                class="flex items-center gap-3 px-3 py-2 text-sm"
                :class="allowed.includes(id) ? '' : 'text-muted-foreground'"
              >
                <input type="checkbox" class="size-4" :checked="allowed.includes(id)" :aria-label="`Allow ${id}`" @change="toggle(id)" />
                <span class="font-mono">{{ id }}</span>
                <span v-if="id === defaultModel" class="ml-auto text-xs text-muted-foreground">Default</span>
                <button
                  v-else-if="allowed.includes(id)"
                  type="button"
                  class="ml-auto text-xs text-primary hover:underline"
                  @click.prevent="defaultModel = id"
                >
                  Make default
                </button>
              </label>
            </div>
            <p class="text-xs text-muted-foreground">Members can only pick these models.</p>
          </div>
          <label class="space-y-1.5">
            <span class="text-xs font-medium">Daily limit per member</span>
            <span class="flex items-center gap-2">
              <Input v-model="dailyLimit" inputmode="numeric" class="w-28 tabular-nums" aria-label="Daily limit per member" />
              <span class="text-sm text-muted-foreground">model calls</span>
            </span>
            <span class="block text-xs text-muted-foreground">Empty means no limit. Resets at midnight UTC.</span>
          </label>
          <details class="space-y-1.5 sm:col-span-2" open>
            <summary class="cursor-pointer text-xs font-medium">Session headers</summary>
            <div class="mt-2 grid gap-4 sm:grid-cols-2">
              <label class="space-y-1.5">
                <span class="text-xs text-muted-foreground">User header</span>
                <Input v-model="userHeader" class="font-mono" aria-label="User header" />
              </label>
              <label class="space-y-1.5">
                <span class="text-xs text-muted-foreground">Chat header</span>
                <Input v-model="sessionHeader" class="font-mono" aria-label="Chat header" />
              </label>
            </div>
            <p class="text-xs text-muted-foreground">Your server gets an anonymous user id and one id per chat. Never names or emails.</p>
          </details>
          <Notice v-if="error || notice" :tone="error ? 'error' : 'success'" class="sm:col-span-2">{{ error ?? notice }}</Notice>
          <Notice v-if="confirmRemove" tone="warning" class="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
            <span>Remove the realm assistant for every member?</span>
            <span class="flex gap-2">
              <Button variant="destructive" size="sm" :disabled="busy" @click="remove">Remove</Button>
              <Button variant="outline" size="sm" @click="confirmRemove = false">Keep it</Button>
            </span>
          </Notice>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-5 py-3">
          <Button
            v-if="setup"
            variant="ghost"
            size="sm"
            class="text-destructive hover:bg-destructive/10 hover:text-destructive"
            :disabled="busy"
            @click="confirmRemove = true"
          >
            <Trash2 class="size-3.5" /> Remove
          </Button>
          <span v-else />
          <span class="flex gap-2">
            <Button variant="outline" size="sm" :disabled="busy || !setup" @click="run(test)">
              <PlugZap class="size-3.5" /> Test
            </Button>
            <Button size="sm" :disabled="busy" @click="save"><Save class="size-3.5" /> Save</Button>
          </span>
        </div>
      </div>
      <div v-if="setup" class="space-y-4">
        <div class="rounded-xl border border-border-subtle bg-card p-5 text-card-foreground shadow-sm dark:shadow-none">
          <div class="flex items-center gap-3">
            <IconTile v-if="!tested" :icon="PlugZap" tone="muted" />
            <IconTile v-else :icon="tested.ok ? CircleCheck : CircleX" :tone="tested.ok ? 'ok' : 'failed'" />
            <div class="min-w-0">
              <p class="text-sm font-medium">{{ !tested ? 'Not tested yet' : tested.ok ? 'Connected' : 'Not connected' }}</p>
              <p v-if="tested" class="text-xs text-muted-foreground">
                {{ tested.ok ? `Tested ${relativeTime(tested.at)}` : tested.message }}
              </p>
            </div>
          </div>
        </div>
        <div v-if="setup.admin" class="space-y-3 rounded-xl border border-border-subtle bg-card p-5 text-card-foreground shadow-sm dark:shadow-none">
          <div class="flex items-center gap-3">
            <IconTile :icon="Clock" tone="aqua" />
            <p class="text-sm font-medium">Last change</p>
          </div>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            <dt class="text-muted-foreground">By</dt>
            <dd class="truncate">{{ changedBy }}</dd>
            <dt class="text-muted-foreground">When</dt>
            <dd>{{ formatDateTime(setup.admin.changed_at) }}</dd>
            <dt class="text-muted-foreground">Kept on</dt>
            <dd class="min-w-0"><NodeLabel :node-id="setup.admin.holder_node" size="sm" /></dd>
          </dl>
        </div>
      </div>
    </div>
  </section>
</template>
