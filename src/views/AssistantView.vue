<script setup lang="ts">
// The assistant on a page of its own: a chat list that folds away beside one
// full-height chat column whose message list is the only scroller on the page.
import { computed, onMounted, onScopeDispose, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Input from '@/components/ui/Input.vue'
import Sheet from '@/components/ui/Sheet.vue'
import SheetContent from '@/components/ui/SheetContent.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import AssistantFileDialog from '@/components/assistant/AssistantFileDialog.vue'
import AssistantHistory from '@/components/assistant/AssistantHistory.vue'
import AssistantSettings from '@/components/assistant/AssistantSettings.vue'
import ChatComposer from '@/components/assistant/ChatComposer.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import MessageList from '@/components/assistant/MessageList.vue'
import { ensureKnownBuckets, useAssistantChat } from '@/composables/useAssistantChat'
import { useAssistantEditor } from '@/composables/useAssistantEditor'
import { useAruna } from '@/composables/useAruna'
import { assistantPageOpen } from '@/composables/assistantState'
import { provideLeaveHandler } from '@/composables/useAssistantObject'
import { readStored, storeValue } from '@/composables/aruna/state'
import { MessageSquare, Minimize2, PanelLeft, Pencil, Plus, Settings, Sparkles } from '@lucide/vue'

const SIDEBAR_KEY = 'aruna.assistant.sidebar'

const router = useRouter()
const { currentUser } = useAruna()
const { bridge } = useAssistantEditor()
const {
  busy,
  draft,
  messages,
  pending,
  available,
  chats,
  activeChatId,
  historyReady,
  provider,
  model,
  loadModels,
  hidePanel,
  showPanel,
  newChat,
  renameChat,
  selectLatestChat,
  ensureProviders,
} = useAssistantChat()

const sidebarOpen = ref(readStored(SIDEBAR_KEY) === 'open')
const drawerOpen = ref(false)
// Below md the chat list is a drawer; the inline column only exists above it.
const wide = ref(true)
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const query = window.matchMedia('(min-width: 768px)')
  const onChange = (event: MediaQueryListEvent) => {
    wide.value = event.matches
  }
  wide.value = query.matches
  query.addEventListener('change', onChange)
  onScopeDispose(() => query.removeEventListener('change', onChange))
}
// Only the inline column carries its own toggle; the drawer opens from the
// chat header.
const railOpen = computed(() => sidebarOpen.value && wide.value)
const renaming = ref(false)
const titleDraft = ref('')
const chatName = computed<string>(() => {
  for (const chat of chats.value) if (chat.id === activeChatId.value) return chat.title
  return 'New chat'
})
const deleteCallId = computed(() =>
  (pending.value?.always ? pending.value.request.id : undefined))
const prompts = computed(() => [
  ...(bridge.value ? ['Explain the draft I have open.'] : []),
  'Help me describe a dataset I want to publish.',
  'Search my realm for datasets about water quality.',
  'Which buckets hold the most data right now?',
])

onMounted(() => {
  selectLatestChat()
  hidePanel()
  assistantPageOpen.value = true
  if (currentUser.value) ensureProviders()
  ensureKnownBuckets()
})
onUnmounted(() => {
  assistantPageOpen.value = false
})

function toggleSidebar() {
  if (!wide.value) {
    drawerOpen.value = !drawerOpen.value
    return
  }
  sidebarOpen.value = !sidebarOpen.value
  storeValue(SIDEBAR_KEY, sidebarOpen.value ? 'open' : '')
}

function startChat() {
  drawerOpen.value = false
  newChat()
}

function beginRename() {
  if (!available.value || !historyReady.value) return
  titleDraft.value = chatName.value
  renaming.value = true
}

function commitRename() {
  if (renaming.value && activeChatId.value) renameChat(activeChatId.value, titleDraft.value)
  renaming.value = false
}

function useSuggestion(prompt: string) {
  draft.value = prompt
}

// A link that really navigates leaves this page, so the chat comes along.
provideLeaveHandler(() => showPanel())

// Back to wherever the chat was opened from, with the panel showing it.
function continueInPanel() {
  showPanel()
  if (window.history.length > 1) router.back()
  else void router.push({ name: 'dashboard' })
}
</script>

<template>
  <div class="flex h-[calc(100dvh-8.5rem)] min-h-0 overflow-hidden md:h-[calc(100dvh-3.5rem)]">
    <aside
      v-if="railOpen"
      aria-label="Chat list"
      class="hidden w-72 max-w-[80vw] shrink-0 flex-col border-r border-border bg-muted/20 md:flex"
    >
      <div class="flex h-12 shrink-0 items-center justify-end border-b border-border px-2">
        <Button
          variant="ghost"
          size="icon-sm"
          :aria-pressed="sidebarOpen"
          aria-label="Toggle the chat list"
          title="Toggle the chat list"
          @click="toggleSidebar"
        >
          <PanelLeft class="size-4" />
        </Button>
      </div>
      <AssistantHistory v-if="historyReady" :read-only="!available" class="min-h-0 flex-1" />
      <div v-else class="min-h-0 flex-1" aria-hidden="true" />
      <div class="shrink-0 border-t border-border p-2">
        <Button
          variant="outline"
          size="sm"
          class="w-full"
          :disabled="!available || !historyReady"
          @click="startChat"
        >
          <Plus class="size-3.5" /> New chat
        </Button>
      </div>
    </aside>

    <Sheet :open="drawerOpen && !wide" @update:open="(value: boolean) => (drawerOpen = value)">
      <SheetContent side="left" class="flex w-80 max-w-[85vw] flex-col gap-0 p-0">
        <div class="flex h-12 shrink-0 items-center border-b border-border px-3 pr-12">
          <DialogTitle class="sr-only">Chats</DialogTitle>
        </div>
        <AssistantHistory v-if="historyReady" :read-only="!available" class="min-h-0 flex-1" />
        <div v-else class="min-h-0 flex-1" aria-hidden="true" />
        <div class="shrink-0 border-t border-border p-2">
          <Button
            variant="outline"
            size="sm"
            class="w-full"
            :disabled="!available || !historyReady"
            @click="startChat"
          >
            <Plus class="size-3.5" /> New chat
          </Button>
        </div>
      </SheetContent>
    </Sheet>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
        <Button
          v-if="!railOpen"
          variant="ghost"
          size="icon-sm"
          class="shrink-0"
          :aria-pressed="sidebarOpen"
          aria-label="Toggle the chat list"
          title="Toggle the chat list"
          @click="toggleSidebar"
        >
          <PanelLeft class="size-4" />
        </Button>
        <Button
          v-if="!railOpen"
          variant="ghost"
          size="icon-sm"
          class="shrink-0"
          aria-label="Start a new chat"
          title="Start a new chat"
          :disabled="!available || !historyReady"
          @click="startChat"
        >
          <Plus class="size-4" />
        </Button>
        <div class="flex min-w-0 flex-1 items-baseline gap-2">
          <span class="eyebrow hidden shrink-0 sm:inline">Assistant</span>
          <Input
            v-if="renaming"
            v-model="titleDraft"
            class="h-7 min-w-0 max-w-64 text-sm"
            aria-label="Chat name"
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="renaming = false"
            @blur="commitRename"
          />
          <button
            v-else
            type="button"
            class="flex min-w-0 items-center gap-1.5 rounded px-1 text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :title="`Rename ${chatName}`"
            @click="beginRename"
          >
            <Pencil class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="truncate">{{ chatName }}</span>
          </button>
        </div>
        <AssistantSettings side="bottom" align="end">
          <button
            type="button"
            class="chip min-w-0 max-w-[8rem] hover:bg-muted sm:max-w-[14rem]"
            aria-label="Model and provider"
            @click="loadModels"
          >
            <Sparkles class="size-3 shrink-0 text-primary" aria-hidden="true" />
            <span class="truncate font-mono">{{ model || 'Choose a model' }}</span>
          </button>
        </AssistantSettings>
        <Button
          variant="ghost"
          size="icon-sm"
          class="shrink-0"
          aria-label="Continue in the panel"
          title="Continue in the panel"
          @click="continueInPanel"
        >
          <Minimize2 class="size-3.5" />
        </Button>
      </header>

      <div v-if="!available" class="flex min-h-0 flex-1 items-center justify-center p-6">
        <EmptyState
          title="No AI provider is ready yet."
          description="Add a provider under Settings, test it, and the assistant appears here and in the top bar."
        >
          <template #icon><MessageSquare class="h-6 w-6" /></template>
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: 'settings', query: { tab: 'assistant' } }">
              <Settings class="size-3.5 shrink-0" aria-hidden="true" /> Open the assistant settings
            </RouterLink>
          </Button>
        </EmptyState>
      </div>

      <template v-else-if="historyReady">
        <MessageList
          v-if="messages.length"
          size="full"
          :messages="messages"
          :busy="busy"
          :delete-call-id="deleteCallId"
          @decide="(approved) => pending?.decide(approved)"
        />
        <div v-else class="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-4 text-center">
          <div class="space-y-2">
            <h1 class="font-display text-2xl font-semibold tracking-tight text-aruna-navy md:text-3xl">
              What can I help you with?
            </h1>
            <p class="text-xs text-muted-foreground">
              {{ provider?.label ?? 'No provider' }} · <span class="font-mono">{{ model || 'no model' }}</span>
            </p>
          </div>
          <div class="flex max-w-[52rem] flex-wrap justify-center gap-2">
            <button
              v-for="prompt in prompts"
              :key="prompt"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm hover:border-primary/40 hover:text-foreground"
              @click="useSuggestion(prompt)"
            >
              <Sparkles class="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              {{ prompt }}
            </button>
          </div>
          <DocsLink
            topic="assistant"
            section="What the assistant can show you"
            label="What the assistant can do"
          />
        </div>

        <div class="shrink-0 pb-4 pt-2">
          <div class="chat-column">
            <ChatComposer size="full" />
          </div>
        </div>
      </template>
    </div>

    <AssistantFileDialog />
  </div>
</template>
