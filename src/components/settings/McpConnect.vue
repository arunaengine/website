<script setup lang="ts">
// Connect an outside MCP client to this node in three steps: pick the client,
// mint the session it authenticates with, paste the snippet. The token is
// shown once, exactly like an S3 secret.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import { useAruna } from '@/composables/useAruna'
import { useUserSessions } from '@/composables/useUserSessions'
import { createSession } from '@/lib/api'
import { apiBaseUrl, authToken } from '@/composables/aruna/state'
import { MCP_CLIENTS, mcpSnippet, type McpClientId } from '@/lib/assistant/mcpSnippets'
import { errorMessage, relativeTime } from '@/lib/utils'
import { Plug } from '@lucide/vue'

const { realmInfo, currentUser } = useAruna()
const { load: reloadSessions } = useUserSessions()

const mcpUrl = computed(() => realmInfo.value?.interfaces.mcp?.url ?? '')
const clientId = ref<McpClientId>('claude-code')
const label = ref('')
const token = ref('')
const expiresAt = ref('')
const busy = ref(false)
const failure = ref<string | null>(null)

const clientOptions = MCP_CLIENTS.map((client) => ({ value: client.id, label: client.title }))
const client = computed(() => MCP_CLIENTS.find((entry) => entry.id === clientId.value) ?? MCP_CLIENTS[0])
const snippet = computed(() => mcpSnippet(mcpUrl.value, token.value, clientId.value))

async function mint() {
  busy.value = true
  failure.value = null
  try {
    const session = await createSession(
      { kind: 'assistant', label: label.value.trim() || client.value.title },
      { baseUrl: apiBaseUrl.value, token: authToken.value },
    )
    token.value = session.token
    expiresAt.value = session.expires_at
    await reloadSessions()
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="surface overflow-hidden">
    <header class="border-b border-border px-5 py-4">
      <div class="flex items-center gap-2">
        <Plug class="h-4 w-4 text-primary" />
        <h3 class="font-display text-sm font-semibold text-aruna-navy">Connect an MCP client</h3>
      </div>
      <p class="text-xs text-muted-foreground">
        Point an AI client at this node's MCP endpoint. The client gets its own session, listed and revocable under Sessions.
      </p>
    </header>

    <div class="border-b border-border px-5 py-3">
      <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">MCP endpoint</div>
      <div v-if="mcpUrl" class="mt-1 flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-2">
        <code class="min-w-0 break-all font-mono text-[11px] text-foreground">{{ mcpUrl }}</code>
        <CopyButton :value="mcpUrl" label="Copy the MCP endpoint" />
      </div>
      <Notice v-else tone="info" class="mt-1">MCP is not available on this node.</Notice>
    </div>

    <ol v-if="mcpUrl" class="divide-y divide-border">
      <li class="grid gap-3 px-5 py-4 md:grid-cols-[2rem_minmax(0,1fr)]">
        <span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
        <div class="min-w-0">
          <p class="text-sm font-medium text-foreground">Pick the client</p>
          <Select
            :model-value="clientId"
            :options="clientOptions"
            class="mt-2 w-full max-w-xs"
            aria-label="MCP client"
            @update:model-value="(value) => (clientId = value as McpClientId)"
          />
        </div>
      </li>

      <li class="grid gap-3 px-5 py-4 md:grid-cols-[2rem_minmax(0,1fr)]">
        <span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
        <div class="min-w-0 space-y-3">
          <div>
            <p class="text-sm font-medium text-foreground">Create a client session</p>
            <p class="text-xs text-muted-foreground">
              The client needs a session token of its own, so it can be revoked without signing you out.
            </p>
          </div>
          <div class="flex flex-wrap items-end gap-2">
            <div class="min-w-48 flex-1">
              <label class="text-xs font-medium text-foreground">Session label</label>
              <Input v-model="label" class="mt-1" :placeholder="`${client.title} on my laptop`" />
            </div>
            <Button size="sm" class="h-9" :disabled="!currentUser || busy" @click="mint">
              {{ busy ? 'Creating…' : token ? 'Create another session' : 'Create client session' }}
            </Button>
          </div>
          <Notice v-if="failure" tone="error">{{ failure }}</Notice>
          <div v-if="token" class="space-y-2">
            <Notice tone="warning">
              This token is shown once. Copy it now; it cannot be read again, and anyone holding it acts as you.
            </Notice>
            <div class="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-2">
              <code class="min-w-0 break-all font-mono text-[11px] text-foreground">{{ token }}</code>
              <CopyButton :value="token" label="Copy the session token" />
            </div>
            <p class="text-[11px] text-muted-foreground" :title="new Date(expiresAt).toLocaleString()">
              Expires {{ relativeTime(expiresAt) }}.
            </p>
          </div>
        </div>
      </li>

      <li class="grid gap-3 px-5 py-4 md:grid-cols-[2rem_minmax(0,1fr)]" :class="token ? '' : 'opacity-60'">
        <span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span>
        <div class="min-w-0 space-y-2">
          <div>
            <p class="text-sm font-medium text-foreground">Configure {{ client.title }}</p>
            <p class="text-xs text-muted-foreground">{{ token ? client.hint : 'Create a client session first; the snippet then carries its token.' }}</p>
          </div>
          <div class="rounded-md border border-border" :aria-disabled="!token">
            <div class="flex items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-2">
              <span class="text-xs font-medium text-foreground">{{ snippet.title }}</span>
              <CopyButton v-if="token" :value="snippet.code" :label="`Copy the ${snippet.title} snippet`" />
            </div>
            <pre class="scrollbar-thin overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">{{ snippet.code }}</pre>
          </div>
        </div>
      </li>
    </ol>
  </section>
</template>
