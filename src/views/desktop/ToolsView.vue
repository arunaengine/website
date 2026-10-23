<script setup lang="ts">
// Connect your tools: the address of this computer, one key per tool, and the
// lines to paste into each program. The key's secret is shown once and is kept
// only in this page's memory.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Notice from '@/components/ui/Notice.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import CreateKeyDialog from '@/components/desktop/CreateKeyDialog.vue'
import { useAruna } from '@/composables/useAruna'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useNodeControl } from '@/composables/useNodeControl'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { keyNames } from '@/lib/keyNames'
import { nextflowSnippet, tesAddress, TOOLS, toolSnippet, type ToolId, type ToolKey } from '@/lib/toolSnippets'
import { errorMessage } from '@/lib/utils'
import { Check, Play, Plus, Trash2 } from '@lucide/vue'

const { credentials, revokeS3Credential, saving } = useAruna()
const { shown } = usePortalFeatures()
const { status, s3Url, mcpUrl } = useDeviceStatus()
const { compute, ensureLoaded: ensureCompute } = useDeviceCompute()
const control = useNodeControl()

const tool = ref<ToolId>('aws')
const createOpen = ref(false)
// The secret of a key made on this page; gone when the page is left.
const fresh = ref<(ToolKey & { name: string }) | null>(null)
const removing = ref<string | null>(null)
const removeError = ref<string | null>(null)

const running = computed(() => status.value?.state === 'running' && status.value.ready === true)
// An address only counts while the node itself reports it.
const address = computed(() => (running.value ? s3Url.value : null))
const tes = computed(() => (running.value ? tesAddress(status.value?.apiBaseUrl) : null))
const names = ref<Record<string, string>>({})
const keys = computed(() => credentials.value.filter((credential) => credential.status === 'active'))

onMounted(() => {
  names.value = keyNames()
  void ensureCompute()
})

const snippet = (id: ToolId): string => toolSnippet(id, address.value, fresh.value, running.value ? mcpUrl.value : null)

function onCreated(key: ToolKey & { name: string }): void {
  fresh.value = key
  names.value = keyNames()
}

async function remove(accessKeyId: string): Promise<void> {
  removeError.value = null
  try {
    await revokeS3Credential(accessKeyId)
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
  <div>
    <PageHeader
      eyebrow="This computer"
      title="Connect your tools"
      description="Use the programs you already know with the data on this computer. Everything on this page stays on this computer."
      :docs="{ topic: 'cli-access-key', label: 'Open the guide' }"
    />

    <div class="container space-y-5 py-5">
      <section class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Address of this computer</h2>
          <Badge :variant="running ? 'success' : 'secondary'">{{ running ? 'Running' : 'Not running' }}</Badge>
        </header>
        <div class="space-y-3 px-5 py-4">
          <p class="text-sm text-muted-foreground">
            Your tools talk to this address like they would to any S3 service. Only programs on this computer can reach
            it.
          </p>
          <div v-if="address" class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-medium text-foreground">S3 address</span>
            <code class="surface-muted flex min-w-0 max-w-[26rem] flex-1 items-center justify-between gap-2 px-3 py-2 font-mono text-xs">
              <span class="truncate">{{ address }}</span>
              <CopyButton :value="address" label="Copy address" />
            </code>
          </div>
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
        </div>
      </section>

      <section class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Access keys</h2>
          <Button variant="outline" size="sm" @click="createOpen = true"><Plus class="h-3.5 w-3.5" /> Create key</Button>
        </header>
        <p class="px-5 pt-4 text-sm text-muted-foreground">
          A key is a user name and a password for your tools. Make one for each tool, so you can remove it alone later.
        </p>
        <div v-if="fresh" class="px-5 pt-4">
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
            <p class="mt-2">The lines below now use this key.</p>
          </Notice>
        </div>
        <ul v-if="keys.length" class="mt-3 divide-y divide-border/70 border-t border-border/70">
          <li v-for="key in keys" :key="key.access_key_id" class="flex flex-wrap items-center gap-3 px-5 py-3">
            <div class="min-w-0 flex-1">
              <p class="truncate font-display text-sm font-semibold text-foreground">
                {{ names[key.access_key_id] || 'Access key' }}
              </p>
              <p class="mt-0.5 truncate text-[11px] text-muted-foreground">
                <span class="font-mono">{{ key.access_key_id }}</span>
                <template v-if="made(key.expires_at)"> · expires {{ made(key.expires_at) }}</template>
              </p>
            </div>
            <template v-if="removing === key.access_key_id">
              <Button variant="destructive" size="sm" :disabled="saving" @click="remove(key.access_key_id)">
                <Check class="h-3.5 w-3.5" /> Yes, remove it
              </Button>
              <Button variant="ghost" size="sm" @click="removing = null">Keep it</Button>
            </template>
            <Button v-else variant="ghost" size="sm" @click="removing = key.access_key_id">
              <Trash2 class="h-3.5 w-3.5" /> Remove
            </Button>
          </li>
        </ul>
        <p v-else class="px-5 pb-4 pt-3 text-xs text-muted-foreground">You have no key yet.</p>
        <Notice v-if="removeError" tone="error" class="mx-5 mb-4">{{ removeError }}</Notice>
      </section>

      <section class="surface overflow-hidden">
        <header class="border-b border-border px-5 py-3">
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Set up a program</h2>
        </header>
        <div class="space-y-3 px-5 py-4">
          <p class="text-sm text-muted-foreground">
            Pick your program and copy the lines.
            {{ fresh ? 'Your new key is already filled in.' : 'Create a key first to fill in your own values.' }}
          </p>
          <Tabs v-model="tool">
            <TabsList>
              <TabsTrigger v-for="entry in TOOLS" :key="entry.id" :value="entry.id">{{ entry.label }}</TabsTrigger>
            </TabsList>
            <TabsContent v-for="entry in TOOLS" :key="entry.id" :value="entry.id" class="mt-4 space-y-3">
              <p class="text-xs text-muted-foreground">{{ entry.text }}</p>
              <div class="surface-muted relative" :class="address ? '' : 'opacity-50'">
                <pre class="overflow-x-auto px-3 py-3 pr-10 font-mono text-[12px] leading-5 text-foreground/90">{{ snippet(entry.id) }}</pre>
                <div v-if="address" class="absolute right-2 top-2"><CopyButton :value="snippet(entry.id)" label="Copy" /></div>
              </div>
              <Notice v-if="entry.id === 'assistant'" tone="info">
                <span class="font-medium text-foreground">Token needed.</span> Replace the token with one you make under
                <RouterLink :to="{ name: 'settings', query: { tab: 'access' } }" class="text-primary hover:underline">
                  Settings, Access &amp; connection
                </RouterLink>. Give it only the access the assistant needs.
              </Notice>
              <Notice v-if="entry.id === 'assistant' && running && !mcpUrl" tone="warning">
                Aruna reports no address for AI assistants, so the line above shows a placeholder.
              </Notice>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      <section v-if="shown('compute')" class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Run jobs with TES</h2>
          <Badge :variant="compute?.enabled ? 'success' : 'secondary'">
            {{ compute?.enabled ? 'Local runs on' : 'Local runs off' }}
          </Badge>
        </header>
        <div class="space-y-3 px-5 py-4">
          <p class="text-sm text-muted-foreground">
            Workflow tools such as Nextflow and Snakemake can send jobs to this computer. The jobs run next to your data,
            so nothing has to be copied.
          </p>
          <div v-if="tes" class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-medium text-foreground">Job address</span>
            <code class="surface-muted flex min-w-0 max-w-[30rem] flex-1 items-center justify-between gap-2 px-3 py-2 font-mono text-xs">
              <span class="truncate">{{ tes }}</span>
              <CopyButton :value="tes" label="Copy address" />
            </code>
          </div>
          <div class="surface-muted relative" :class="tes ? '' : 'opacity-50'">
            <pre class="overflow-x-auto px-3 py-3 pr-10 font-mono text-[12px] leading-5 text-foreground/90">{{ nextflowSnippet(tes) }}</pre>
            <div v-if="tes" class="absolute right-2 top-2"><CopyButton :value="nextflowSnippet(tes)" label="Copy" /></div>
          </div>
          <p v-if="!compute?.enabled" class="text-[11px] text-muted-foreground">
            Needs local runs. Turn them on under
            <RouterLink :to="{ name: 'device' }" class="text-primary hover:underline">This computer</RouterLink>.
          </p>
        </div>
      </section>
    </div>

    <CreateKeyDialog v-model:open="createOpen" @created="onCreated" />
  </div>
</template>
