<script setup lang="ts">
// The AI providers this account has configured. Keys live sealed on the node;
// the browser only ever sees the summaries listed here.
import { ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import ChatGptLogin from '@/components/settings/ChatGptLogin.vue'
import ProviderForm from '@/components/settings/ProviderForm.vue'
import { useAruna } from '@/composables/useAruna'
import { useAssistantProviders } from '@/composables/useAssistantProviders'
import { PROVIDER_KIND_LABELS, type AssistantProvider } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { Plus } from '@lucide/vue'

const { currentUser } = useAruna()
const { providers, loading, error, load, remove } = useAssistantProviders()

const adding = ref(false)
const editingId = ref('')
const confirmingDelete = ref('')
const removeError = ref<string | null>(null)

let loadedOnce = false
watch(currentUser, (user) => {
  if (!user || loadedOnce) return
  loadedOnce = true
  void load()
}, { immediate: true })

function edit(provider: AssistantProvider) {
  adding.value = false
  editingId.value = provider.provider_id
}

function close() {
  adding.value = false
  editingId.value = ''
}

function statusVariant(provider: AssistantProvider) {
  if (provider.status === 'ready') return 'accent' as const
  return provider.status === 'error' ? ('destructive' as const) : ('secondary' as const)
}

async function confirmRemove(providerId: string) {
  confirmingDelete.value = ''
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
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div class="min-w-0">
        <h3 class="font-display text-sm font-semibold text-aruna-navy">AI providers</h3>
        <p class="text-xs text-muted-foreground">
          Bring your own account. The node stores each key sealed and makes the provider calls for you.
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <RefreshButton :busy="loading" sr-label="Refresh providers" @click="load" />
        <Button v-if="!adding" size="sm" :disabled="!currentUser" @click="adding = true; editingId = ''">
          <Plus class="h-3.5 w-3.5" /> Add provider
        </Button>
      </div>
    </header>

    <p v-if="!currentUser" class="px-5 py-6 text-xs text-muted-foreground">Sign in to configure a provider.</p>
    <template v-else>
      <RefusalNote v-if="error" :message="error" class="mx-5 mt-4" />
      <RefusalNote v-if="removeError" :message="removeError" class="mx-5 mt-4" />

      <div v-if="adding" class="border-b border-border bg-muted/20 px-5 py-4">
        <ProviderForm @done="close" @cancel="close" />
      </div>

      <ul class="divide-y divide-border">
        <li v-for="provider in providers" :key="provider.provider_id" class="px-5 py-3">
          <div class="flex flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium text-foreground">{{ provider.label }}</span>
                <Badge size="sm" variant="secondary">{{ PROVIDER_KIND_LABELS[provider.kind] }}</Badge>
                <Badge size="sm" :variant="statusVariant(provider)" class="uppercase">{{ provider.status }}</Badge>
              </div>
              <p class="mt-0.5 truncate text-[11px] text-muted-foreground">
                {{ provider.default_model || 'No default model chosen' }}
                <template v-if="provider.base_url"> · {{ provider.base_url }}</template>
              </p>
            </div>
            <div v-if="confirmingDelete === provider.provider_id" class="flex items-center gap-2">
              <span class="text-[11px] text-muted-foreground">Delete this provider?</span>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive"
                @click="confirmRemove(provider.provider_id)"
              >Delete</Button>
              <Button variant="ghost" size="sm" @click="confirmingDelete = ''">Cancel</Button>
            </div>
            <div v-else class="flex items-center gap-2">
              <Button variant="outline" size="sm" @click="edit(provider)">Edit</Button>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive"
                @click="confirmingDelete = provider.provider_id"
              >Delete</Button>
            </div>
          </div>
          <div v-if="editingId === provider.provider_id" class="mt-4 rounded-md border border-border bg-muted/20 p-4">
            <ProviderForm :provider="provider" @done="close" @cancel="close" />
          </div>
        </li>
        <li v-if="!providers.length && !adding" class="px-5 py-6 text-center text-xs text-muted-foreground">
          No providers configured yet.
        </li>
      </ul>

      <div class="border-t border-border px-5 py-4">
        <ChatGptLogin />
      </div>
    </template>
  </section>
</template>
