<script setup lang="ts">
// Every configured provider in one list: the browser-held keys of this tab and
// the sign-ins the node keeps. Adding and editing happen in one dialog.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import ProviderForm from './ProviderForm.vue'
import ProviderIcon from './ProviderIcon.vue'
import { providerChoice, providerKind, providerStatus } from './providerKinds'
import { useAruna } from '@/composables/useAruna'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { useAssistantProviders } from '@/composables/useAssistantProviders'
import { apiBaseUrl, authToken } from '@/composables/aruna/state'
import { testAssistantProvider, type AssistantProvider } from '@/lib/api'
import { toneVariant } from '@/lib/stateBadge'
import { errorMessage } from '@/lib/utils'
import { Check, MoreHorizontal, Pencil, Plug2, Plus, Star, Trash2 } from '@lucide/vue'

const { currentUser, sessionEpoch } = useAruna()
const { providers, loading, error, load, remove, check, direct } = useAssistantProviders()
const { provider: activeProvider, selectProvider } = useAssistantChat()

const dialogOpen = ref(false)
const editingId = ref('')
const removingId = ref('')
const removeError = ref<string | null>(null)
const testingId = ref('')
const results = ref<Record<string, { ok: boolean; message: string }>>({})

const editingProvider = computed(() =>
  providers.value.find((provider) => provider.provider_id === editingId.value) ?? null)
const removingProvider = computed(() =>
  providers.value.find((provider) => provider.provider_id === removingId.value) ?? null)
const defaultId = computed(() => activeProvider.value?.provider_id ?? '')

watch(currentUser, (user) => {
  if (user) void load()
}, { immediate: true })
watch(sessionEpoch, closeAll, { flush: 'sync' })
watch(() => currentUser.value?.id ?? '', closeAll, { flush: 'sync' })

function closeAll() {
  dialogOpen.value = false
  editingId.value = ''
  removingId.value = ''
  results.value = {}
}

function add() {
  editingId.value = ''
  dialogOpen.value = true
}

function edit(provider: AssistantProvider) {
  editingId.value = provider.provider_id
  dialogOpen.value = true
}

function setDialog(open: boolean) {
  dialogOpen.value = open
  if (!open) editingId.value = ''
}

function choice(provider: AssistantProvider) {
  return providerChoice(provider, direct(provider.provider_id))
}

function status(provider: AssistantProvider) {
  return providerStatus(provider, direct(provider.provider_id))
}

function kindTitle(provider: AssistantProvider): string {
  return providerKind(choice(provider)).title
}

function where(provider: AssistantProvider): string {
  return direct(provider.provider_id) ? 'This tab' : 'Node'
}

// The assistant's provider choice is the default; switching it starts a new chat.
function makeDefault(provider: AssistantProvider) {
  selectProvider(provider.provider_id)
}

async function test(provider: AssistantProvider) {
  const local = direct(provider.provider_id)
  testingId.value = provider.provider_id
  try {
    const result = local
      ? await check(local)
      : await testAssistantProvider(provider.provider_id, { baseUrl: apiBaseUrl.value, token: authToken.value })
    results.value = { ...results.value, [provider.provider_id]: result }
  } catch (cause) {
    results.value = { ...results.value, [provider.provider_id]: { ok: false, message: errorMessage(cause) } }
  } finally {
    testingId.value = ''
  }
}

async function confirmRemove() {
  const providerId = removingId.value
  removingId.value = ''
  removeError.value = null
  try {
    await remove(providerId)
  } catch (cause) {
    removeError.value = errorMessage(cause)
  }
}
</script>

<template>
  <section class="surface overflow-hidden">
    <header class="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div class="min-w-0">
        <h3 class="font-display text-sm font-semibold text-aruna-navy">Providers</h3>
        <p class="text-xs text-muted-foreground">
          API keys stay in this browser tab and are never sent to Aruna; a ChatGPT sign-in is kept by the node.
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <RefreshButton :busy="loading" sr-label="Refresh providers" @click="load" />
        <Button size="sm" :disabled="!currentUser" @click="add">
          <Plus class="size-3.5" /> Add provider
        </Button>
      </div>
    </header>

    <EmptyState v-if="!currentUser" compact title="Sign in to configure a provider." class="m-5" />
    <template v-else>
      <Notice v-if="error" tone="error" class="mx-5 mt-4">{{ error }}</Notice>
      <Notice v-if="removeError" tone="error" class="mx-5 mt-4">{{ removeError }}</Notice>

      <EmptyState
        v-if="!providers.length"
        compact
        title="No providers yet."
        description="Add a key or sign in to turn on the assistant."
        class="m-5"
      >
        <Button size="sm" @click="add"><Plus class="size-3.5" /> Add provider</Button>
      </EmptyState>

      <ul v-else class="divide-y divide-border">
        <li v-for="provider in providers" :key="provider.provider_id" class="px-5 py-3">
          <div class="flex items-center gap-3">
            <ProviderIcon :choice="choice(provider)" />
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-center gap-2">
                <span class="truncate text-sm font-medium text-foreground">{{ provider.label }}</span>
                <Badge v-if="provider.provider_id === defaultId" size="sm">Default</Badge>
              </div>
              <p class="mt-0.5 truncate text-xs text-muted-foreground">
                {{ kindTitle(provider) }} · {{ provider.default_model || 'No model chosen' }} · {{ where(provider) }}
              </p>
            </div>
            <Spinner v-if="testingId === provider.provider_id" label="Testing the provider" />
            <Badge v-else size="sm" :variant="toneVariant(status(provider).tone)">
              {{ status(provider).label }}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon-sm" :aria-label="`Actions for ${provider.label}`">
                  <MoreHorizontal class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-52">
                <DropdownMenuItem
                  :disabled="provider.provider_id === defaultId || status(provider).tone !== 'done'"
                  @click="makeDefault(provider)"
                >
                  <Star class="size-3.5" /> Set as default
                </DropdownMenuItem>
                <DropdownMenuItem v-if="direct(provider.provider_id)" @click="edit(provider)">
                  <Pencil class="size-3.5" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem :disabled="Boolean(testingId)" @click="test(provider)">
                  <Plug2 class="size-3.5" /> Test connection
                </DropdownMenuItem>
                <DropdownMenuItem class="text-destructive" @click="removingId = provider.provider_id">
                  <Trash2 class="size-3.5" /> Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p
            v-if="results[provider.provider_id]"
            class="mt-1.5 pl-12 text-xs"
            :class="results[provider.provider_id].ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'"
          >
            <Check v-if="results[provider.provider_id].ok" class="mr-1 inline size-3.5" />
            {{ results[provider.provider_id].message }}
          </p>
        </li>
      </ul>
    </template>

    <Dialog :open="dialogOpen" @update:open="setDialog">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ editingProvider ? 'Edit provider' : 'Add provider' }}</DialogTitle>
          <DialogDescription>
            The assistant talks to this provider from your browser unless the node holds the credential.
          </DialogDescription>
        </DialogHeader>
        <ProviderForm
          :key="editingId || 'new'"
          :provider="editingProvider"
          @done="setDialog(false)"
          @cancel="setDialog(false)"
        />
      </DialogContent>
    </Dialog>

    <Dialog :open="Boolean(removingProvider)" @update:open="(open: boolean) => { if (!open) removingId = '' }">
      <DialogContent class="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove {{ removingProvider?.label }}?</DialogTitle>
          <DialogDescription>
            The assistant stops using it. A browser key is dropped from this tab; a node sign-in is revoked.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" @click="removingId = ''">Cancel</Button>
          <Button variant="destructive" size="sm" @click="confirmRemove">Remove</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
