<script setup lang="ts">
// Sign in with a ChatGPT subscription: the node runs the device-code flow and
// keeps the tokens, this card only shows the code and waits for the verdict.
import { computed, onBeforeUnmount, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Notice from '@/components/ui/Notice.vue'
import { useAssistantProviders } from '@/composables/useAssistantProviders'
import { pollChatGptLogin, startChatGptLogin, type ChatGptLoginStatus } from '@/lib/api'
import { apiBaseUrl, authToken } from '@/composables/aruna/state'
import { isDesktop } from '@/lib/desktop'
import { errorMessage } from '@/lib/utils'
import { ExternalLink } from '@lucide/vue'

const { load } = useAssistantProviders()

const userCode = ref('')
const verificationUrl = ref('')
const status = ref<ChatGptLoginStatus | 'idle'>('idle')
const failure = ref<string | null>(null)
const busy = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

const waiting = computed(() => status.value === 'pending')

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

function stopPolling() {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

function schedule(providerId: string, intervalSeconds: number) {
  timer = setTimeout(() => void poll(providerId, intervalSeconds), Math.max(intervalSeconds, 1) * 1000)
}

async function poll(providerId: string, intervalSeconds: number) {
  try {
    const result = await pollChatGptLogin(providerId, client())
    status.value = result.status
    if (result.status === 'pending') {
      schedule(providerId, intervalSeconds)
      return
    }
    if (result.status === 'ready') await load()
  } catch (cause) {
    status.value = 'idle'
    failure.value = errorMessage(cause)
  }
}

async function openVerification() {
  if (!verificationUrl.value) return
  if (isDesktop()) {
    const { openExternal } = await import('@/lib/desktopBridge')
    await openExternal(verificationUrl.value)
    return
  }
  window.open(verificationUrl.value, '_blank', 'noopener')
}

async function start() {
  busy.value = true
  failure.value = null
  stopPolling()
  try {
    const login = await startChatGptLogin('ChatGPT subscription', client())
    userCode.value = login.user_code
    verificationUrl.value = login.verification_url
    status.value = 'pending'
    schedule(login.provider_id, login.interval_seconds)
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(stopPolling)
</script>

<template>
  <div class="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h4 class="text-sm font-medium text-foreground">Sign in with ChatGPT</h4>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Use a regular ChatGPT subscription instead of an API key. This uses OpenAI's Codex sign-in, which is their
          client and may stop working.
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="busy || waiting" @click="start">
        {{ waiting ? 'Waiting…' : 'Sign in with ChatGPT' }}
      </Button>
    </div>

    <div v-if="waiting" class="space-y-2">
      <div class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
        <span class="text-[11px] uppercase tracking-wider text-muted-foreground">Code</span>
        <code class="font-mono text-sm tracking-widest text-foreground">{{ userCode }}</code>
        <CopyButton :value="userCode" label="Copy the sign-in code" />
      </div>
      <Button variant="link" size="sm" class="h-auto p-0" @click="openVerification">
        <ExternalLink class="h-3.5 w-3.5" /> Open the OpenAI sign-in page
      </Button>
      <p class="text-[11px] text-muted-foreground">Enter the code there; this card follows the result.</p>
    </div>

    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    <Notice v-else-if="status === 'ready'" tone="success">
      Signed in. The subscription is listed as a provider with its model list.
    </Notice>
    <Notice v-else-if="status === 'expired'" tone="warning">The code expired before it was entered.</Notice>
    <Notice v-else-if="status === 'denied'" tone="warning">The sign-in was denied at OpenAI.</Notice>
  </div>
</template>
