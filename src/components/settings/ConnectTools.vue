<script setup lang="ts">
// Connect your tools, in the desktop's Access & connection settings: the
// address of a place (this computer or a realm node), one key list for every
// place, and the lines to paste into each program. A key's secret is shown once
// and is kept only in this page's memory.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Notice from '@/components/ui/Notice.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import CreateKeyDialog from '@/components/desktop/CreateKeyDialog.vue'
import { useAruna } from '@/composables/useAruna'
import { useDeviceKeys } from '@/composables/useDeviceKeys'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useNodeControl } from '@/composables/useNodeControl'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { useRealmNodes, type RealmNodeDisplay } from '@/composables/useRealmNodes'
import type { S3CredentialSummary } from '@/lib/api'
import { createDeviceCredential, listDeviceCredentials, revokeDeviceCredential } from '@/lib/deviceApi'
import { keyNames } from '@/lib/keyNames'
import { nextflowSnippet, tesAddress, TOOLS, toolSnippet, type ToolId, type ToolKey } from '@/lib/toolSnippets'
import { errorMessage } from '@/lib/utils'
import { Check, KeyRound, Laptop, Play, Plus, Server, SquareTerminal, Trash2 } from '@lucide/vue'

const DEVICE = 'device'

const route = useRoute()
const { shown } = usePortalFeatures()
const { authToken, realmInfo } = useAruna()
const { nodes } = useRealmNodes()
const { status, s3Url, mcpUrl, deviceClient } = useDeviceStatus()
const deviceKeys = useDeviceKeys()
const control = useNodeControl()

// Realm nodes a tool can reach: published S3 and API addresses, never a device.
const realmNodes = computed(() => nodes.value.filter((node) => node.kind !== 'user' && node.s3Url && node.apiBase))
const placeId = ref(DEVICE)
const node = computed(() => realmNodes.value.find((entry) => entry.nodeId === placeId.value) ?? null)

const running = computed(() => status.value?.state === 'running' && status.value.ready === true)
// An address only counts while its node reports it.
const address = computed(() => (node.value ? node.value.s3Url : running.value ? s3Url.value : null))
const tes = computed(() =>
  node.value ? tesAddress(node.value.apiBase) : running.value ? tesAddress(status.value?.apiBaseUrl) : null,
)
const assistant = computed(() =>
  node.value ? (realmInfo.value?.interfaces.mcp?.url ?? null) : running.value ? mcpUrl.value : null,
)

const programs = computed(() => [
  ...TOOLS.filter((tool) => tool.id !== 'assistant'),
  ...(shown('compute')
    ? [{ id: 'nextflow', label: 'Nextflow', text: 'Sends workflow jobs to the job address. Snakemake works the same way.' }]
    : []),
  ...TOOLS.filter((tool) => tool.id === 'assistant'),
])
const program = ref('aws')

// Keys are node-local, so each realm node is asked for its own.
const nodeKeys = ref<Record<string, S3CredentialSummary[]>>({})
const nodeErrors = ref<Record<string, string>>({})
let generation = 0

function nodeClient(entry: RealmNodeDisplay) {
  return { baseUrl: entry.apiBase ?? '', token: authToken.value }
}

async function loadNodeKeys(): Promise<void> {
  const mine = ++generation
  nodeKeys.value = {}
  nodeErrors.value = {}
  if (!authToken.value) return
  await Promise.all(
    realmNodes.value.map(async (entry) => {
      try {
        const found = await listDeviceCredentials(nodeClient(entry))
        if (mine !== generation) return
        nodeKeys.value = { ...nodeKeys.value, [entry.nodeId]: found.filter((key) => key.status === 'active') }
      } catch (err) {
        if (mine !== generation) return
        nodeErrors.value = { ...nodeErrors.value, [entry.nodeId]: errorMessage(err) }
      }
    }),
  )
}

watch([() => realmNodes.value.map((entry) => entry.nodeId).join(' '), authToken], () => void loadNodeKeys(), {
  immediate: true,
})

const keys = computed(() => [
  ...deviceKeys.active.value.map((key) => ({ key, node: null as RealmNodeDisplay | null })),
  ...realmNodes.value.flatMap((entry) => (nodeKeys.value[entry.nodeId] ?? []).map((key) => ({ key, node: entry }))),
])
const keyFailures = computed(() =>
  realmNodes.value.filter((entry) => nodeErrors.value[entry.nodeId]).map((entry) => ({ entry, error: nodeErrors.value[entry.nodeId] })),
)
const keysRead = computed(
  () =>
    deviceKeys.state.value !== 'idle' &&
    deviceKeys.state.value !== 'loading' &&
    (!authToken.value || realmNodes.value.every((entry) => nodeKeys.value[entry.nodeId] || nodeErrors.value[entry.nodeId])),
)

const createOpen = ref(false)
const tokenOpen = ref(false)
// The secret of a key made on this page, with the place it works; gone when the page is left.
const fresh = ref<(ToolKey & { name: string; nodeId: string | null }) | null>(null)
const removing = ref<string | null>(null)
const removeError = ref<string | null>(null)
const names = ref<Record<string, string>>({})
// A secret belongs to the node that made it, so a change of this computer's node forgets it.
watch(deviceClient, () => {
  if (fresh.value && !fresh.value.nodeId) fresh.value = null
})

const canCreate = computed(() => (node.value ? Boolean(authToken.value) : deviceKeys.available.value))

// The key request in flight and the place it started at. Closing the dialog
// drops it, so a late answer never lands on another place.
let pendingKey: { nodeId: string | null; accessKeyId?: string } | null = null
watch(createOpen, (open) => {
  if (!open) pendingKey = null
})

// Without this computer's node the dialog keeps its own "not running" answer.
const createKey = computed(() => {
  const target = node.value
  if (!target && !deviceKeys.available.value) return undefined
  const client = target ? nodeClient(target) : null
  return async (groupId: string, expiresInSeconds: number) => {
    const request: { nodeId: string | null; accessKeyId?: string } = { nodeId: target?.nodeId ?? null }
    pendingKey = request
    const made = client
      ? await createDeviceCredential({ group_id: groupId, expires_in_seconds: expiresInSeconds }, client)
      : await deviceKeys.create(groupId, expiresInSeconds)
    request.accessKeyId = made.access_key_id
    if (client) await loadNodeKeys()
    return made
  }
})

onMounted(() => {
  names.value = keyNames()
  if (route.query.create === 'key') createOpen.value = true
})

const freshHere = computed(() => (fresh.value && fresh.value.nodeId === (node.value?.nodeId ?? null) ? fresh.value : null))
const snippet = (id: string): string =>
  id === 'nextflow' ? nextflowSnippet(tes.value) : toolSnippet(id as ToolId, address.value, freshHere.value, assistant.value)
const ready = (id: string) => Boolean(id === 'nextflow' ? tes.value : address.value)

function onCreated(key: ToolKey & { name: string }): void {
  const request = pendingKey
  names.value = keyNames()
  if (!request || request.accessKeyId !== key.accessKeyId) return
  pendingKey = null
  fresh.value = { ...key, nodeId: request.nodeId }
}

async function remove(accessKeyId: string, owner: RealmNodeDisplay | null): Promise<void> {
  removeError.value = null
  try {
    if (owner) {
      await revokeDeviceCredential(accessKeyId, nodeClient(owner))
      await loadNodeKeys()
    } else {
      await deviceKeys.remove(accessKeyId)
    }
    if (fresh.value?.accessKeyId === accessKeyId) fresh.value = null
    removing.value = null
  } catch (err) {
    removeError.value = errorMessage(err)
  }
}

function made(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="space-y-5">
    <section class="surface overflow-hidden">
      <header class="flex items-center gap-2 border-b border-border px-5 py-3">
        <SquareTerminal class="h-4 w-4 text-primary" />
        <h3 class="font-display text-sm font-semibold text-aruna-navy">Connect your tools</h3>
      </header>
      <div class="space-y-3 px-5 py-4">
        <p class="text-sm text-muted-foreground">Use aws, rclone, Python, Nextflow or an AI assistant with your data.</p>
        <div class="flex flex-wrap items-center gap-3">
          <Tabs v-model="placeId">
            <TabsList aria-label="Address for" class="h-auto flex-wrap justify-start">
              <TabsTrigger :value="DEVICE" class="gap-1.5 text-xs"><Laptop class="h-3.5 w-3.5" /> This computer</TabsTrigger>
              <TabsTrigger
                v-for="entry in realmNodes"
                :key="entry.nodeId"
                :value="entry.nodeId"
                :title="entry.title"
                class="gap-1.5 text-xs"
              >
                <Server class="h-3.5 w-3.5" /> {{ entry.label }}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <code v-if="address" class="surface-muted flex min-w-0 max-w-[26rem] items-center gap-2 px-3 py-2 font-mono text-xs">
            <span class="truncate">{{ address }}</span>
            <CopyButton :value="address" label="Copy address" />
          </code>
          <Badge v-if="node" :variant="node.reachable ? 'success' : 'secondary'" size="sm">
            {{ node.reachable ? 'Reachable' : 'Not reachable' }}
          </Badge>
          <Badge v-else :variant="running ? 'success' : 'secondary'" size="sm">{{ running ? 'Running' : 'Not running' }}</Badge>
        </div>
        <p v-if="node" class="text-xs text-muted-foreground">Programs on any computer can use this address.</p>
        <template v-else>
          <p v-if="address" class="text-xs text-muted-foreground">
            Only programs on this computer can reach this address. It works while Aruna runs here.
          </p>
          <div v-else-if="!running" class="flex flex-wrap items-center gap-3">
            <p class="text-xs text-muted-foreground">Start Aruna to get an address. The lines below are greyed out until then.</p>
            <Button variant="outline" size="sm" :disabled="control.busy.value" @click="control.start">
              <Play class="h-3.5 w-3.5" /> Start
            </Button>
          </div>
          <Notice v-else tone="warning">
            Aruna reports no address for your tools. Check that the address is on under
            <RouterLink :to="{ name: 'device' }" class="underline">This computer</RouterLink>.
          </Notice>
          <Notice v-if="control.error.value" tone="error">{{ control.error.value }}</Notice>
        </template>
      </div>
    </section>

    <section class="surface overflow-hidden">
      <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div class="flex items-center gap-2">
          <KeyRound class="h-4 w-4 text-primary" />
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Access keys</h3>
          <Badge v-if="keysRead" variant="outline" size="count">{{ keys.length }}</Badge>
        </div>
        <Button variant="outline" size="sm" :disabled="!canCreate" @click="createOpen = true">
          <Plus class="h-3.5 w-3.5" /> Create key
        </Button>
      </header>
      <p class="px-5 pt-3 text-xs text-muted-foreground">
        A key is a user name and a password for your tools. Make one per tool, so you can remove it alone. A key works
        only at its place.
      </p>
      <div v-if="fresh" class="px-5 pt-3">
        <Notice tone="success">
          <p class="font-medium">Your new key is ready. Copy the secret now. It is not shown again.</p>
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            <div class="surface-inline flex items-center justify-between gap-2 bg-card px-3 py-2">
              <div class="min-w-0">
                <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Key ID</p>
                <p class="truncate font-mono text-xs text-foreground">{{ fresh.accessKeyId }}</p>
              </div>
              <CopyButton :value="fresh.accessKeyId" label="Copy key ID" />
            </div>
            <div class="surface-inline flex items-center justify-between gap-2 bg-card px-3 py-2">
              <div class="min-w-0">
                <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Secret</p>
                <p class="truncate font-mono text-xs text-foreground">{{ fresh.secret }}</p>
              </div>
              <CopyButton :value="fresh.secret" label="Copy secret" />
            </div>
          </div>
          <p class="mt-2">The lines below use this key while its place is chosen above.</p>
        </Notice>
      </div>
      <ul v-if="keys.length" class="mt-3 divide-y divide-border/70 border-t border-border/70">
        <li v-for="{ key, node: owner } in keys" :key="`${owner?.nodeId ?? DEVICE}/${key.access_key_id}`" class="flex flex-wrap items-center gap-3 px-5 py-3">
          <KeyRound class="h-4 w-4 shrink-0 text-muted-foreground" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="truncate text-sm font-medium text-foreground">{{ names[key.access_key_id] || 'Access key' }}</span>
              <Badge v-if="owner" variant="outline" size="sm" :title="owner.title">
                <Server class="h-3 w-3" /> {{ owner.label }}
              </Badge>
              <Badge v-else variant="default" size="sm"><Laptop class="h-3 w-3" /> This computer</Badge>
            </div>
            <p class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {{ key.access_key_id }}<template v-if="made(key.expires_at)"> · expires {{ made(key.expires_at) }}</template>
            </p>
          </div>
          <template v-if="removing === key.access_key_id">
            <Button variant="destructive" size="sm" @click="remove(key.access_key_id, owner)">
              <Check class="h-3.5 w-3.5" /> Yes, remove it
            </Button>
            <Button variant="ghost" size="sm" @click="removing = null">Keep it</Button>
          </template>
          <Button v-else variant="ghost" size="sm" @click="removing = key.access_key_id">
            <Trash2 class="h-3.5 w-3.5" /> Remove
          </Button>
        </li>
      </ul>
      <p v-if="!keysRead" class="px-5 pb-4 pt-3 text-xs text-muted-foreground">Reading your keys…</p>
      <p v-else-if="deviceKeys.state.value !== 'ready'" class="px-5 pb-4 pt-3 text-xs text-muted-foreground">
        The keys of this computer cannot be listed right now. Start Aruna first, then they show up here.
      </p>
      <p v-else-if="!keys.length && !keyFailures.length" class="px-5 pb-4 pt-3 text-xs text-muted-foreground">
        You have no key yet.
      </p>
      <p v-for="failure in keyFailures" :key="failure.entry.nodeId" class="px-5 pb-3 text-xs text-destructive">
        The keys on {{ failure.entry.label }} could not be listed: {{ failure.error }}
      </p>
      <Notice v-if="removeError" tone="error" class="mx-5 mb-4">{{ removeError }}</Notice>
    </section>

    <section class="surface overflow-hidden">
      <header class="flex items-center gap-2 border-b border-border px-5 py-3">
        <SquareTerminal class="h-4 w-4 text-primary" />
        <h3 class="font-display text-sm font-semibold text-aruna-navy">Set up a program</h3>
      </header>
      <div class="space-y-3 px-5 py-4">
        <p class="text-sm text-muted-foreground">
          Pick your program and copy the lines.
          {{ freshHere ? 'Your new key is already filled in.' : 'Create a key first to fill in your own values.' }}
        </p>
        <Tabs v-model="program">
          <TabsList class="h-auto flex-wrap justify-start">
            <TabsTrigger v-for="entry in programs" :key="entry.id" :value="entry.id">{{ entry.label }}</TabsTrigger>
          </TabsList>
          <TabsContent v-for="entry in programs" :key="entry.id" :value="entry.id" class="mt-4 space-y-3">
            <p class="text-xs text-muted-foreground">{{ entry.text }}</p>
            <div class="surface-muted relative" :class="ready(entry.id) ? '' : 'opacity-50'">
              <pre class="overflow-x-auto px-3 py-3 pr-10 font-mono text-[12px] leading-5 text-foreground/90">{{ snippet(entry.id) }}</pre>
              <div v-if="ready(entry.id)" class="absolute right-2 top-2"><CopyButton :value="snippet(entry.id)" label="Copy" /></div>
            </div>
            <Notice v-if="entry.id === 'assistant'" tone="info">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span class="font-medium text-foreground">Token needed.</span> Replace the token with a bearer token
                  that has only the access the assistant needs.
                </span>
                <Button variant="outline" size="sm" @click="tokenOpen = true">Create token</Button>
              </div>
            </Notice>
            <Notice v-if="entry.id === 'assistant' && address && !assistant" tone="warning">
              Aruna reports no address for AI assistants, so the line above shows a placeholder.
            </Notice>
          </TabsContent>
        </Tabs>
      </div>
    </section>

    <CreateKeyDialog v-model:open="createOpen" :create="createKey" @created="onCreated" />
    <CreateCredentialDialog v-model:open="tokenOpen" />
  </div>
</template>
