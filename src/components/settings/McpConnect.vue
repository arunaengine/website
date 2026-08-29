<script setup lang="ts">
// Connect an outside MCP client (Claude Code, Cursor, Codex, Gemini) to this
// node. The client authenticates with a session the user mints here; the token
// is shown once, exactly like an S3 secret.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { useAruna } from '@/composables/useAruna'
import { useUserSessions } from '@/composables/useUserSessions'
import { createSession } from '@/lib/api'
import { apiBaseUrl, authToken } from '@/composables/aruna/state'
import { mcpSnippets } from '@/lib/assistant/mcpSnippets'
import { errorMessage } from '@/lib/utils'
import { Plug } from '@lucide/vue'

const { realmInfo, currentUser } = useAruna()
const { load: reloadSessions } = useUserSessions()

const mcpUrl = computed(() => realmInfo.value?.interfaces.mcp?.url ?? '')
const label = ref('')
const token = ref('')
const busy = ref(false)
const failure = ref<string | null>(null)

const snippets = computed(() => mcpSnippets(mcpUrl.value, token.value))

async function mint() {
  busy.value = true
  failure.value = null
  try {
    const session = await createSession(
      { kind: 'assistant', label: label.value.trim() || 'MCP client' },
      { baseUrl: apiBaseUrl.value, token: authToken.value },
    )
    token.value = session.token
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
        Point an AI client at this node's MCP endpoint. It gets its own session, listed and revocable under Sessions.
      </p>
    </header>

    <div v-if="!mcpUrl" class="px-5 py-6">
      <Notice tone="info">MCP is not available on this node.</Notice>
    </div>

    <div v-else class="space-y-4 p-5">
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">MCP endpoint</div>
        <div class="mt-1 flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-2">
          <code class="min-w-0 break-all font-mono text-[11px] text-foreground">{{ mcpUrl }}</code>
          <CopyButton :value="mcpUrl" label="Copy the MCP endpoint" />
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-2">
        <div class="min-w-48 flex-1">
          <label class="text-xs font-medium text-foreground">Session label</label>
          <Input v-model="label" class="mt-1" placeholder="Claude Code on my laptop" />
        </div>
        <Button size="sm" :disabled="!currentUser || busy" @click="mint">
          {{ busy ? 'Starting…' : 'Start a client session' }}
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
      </div>

      <div class="space-y-3">
        <div v-for="snippet in snippets" :key="snippet.id" class="rounded-md border border-border">
          <div class="flex items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-2">
            <div class="min-w-0">
              <div class="text-xs font-medium text-foreground">{{ snippet.title }}</div>
              <div class="text-[11px] text-muted-foreground">{{ snippet.hint }}</div>
            </div>
            <CopyButton :value="snippet.code" :label="`Copy the ${snippet.title} snippet`" />
          </div>
          <pre class="scrollbar-thin overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">{{ snippet.code }}</pre>
        </div>
      </div>
    </div>
  </section>
</template>
