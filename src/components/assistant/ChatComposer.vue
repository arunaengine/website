<script setup lang="ts">
// The message box: Enter sends, Shift+Enter breaks the line. It gathers the
// context a turn needs (route, open draft, realm profiles) itself, and the
// cogwheel beside Send carries the provider, model and approval choices.
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Popover from '@/components/ui/Popover.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Textarea from '@/components/ui/Textarea.vue'
import ModelCombobox from '@/components/assistant/ModelCombobox.vue'
import { useAruna } from '@/composables/useAruna'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { useAssistantEditor } from '@/composables/useAssistantEditor'
import { SendHorizontal, Settings2 } from '@lucide/vue'

const props = withDefaults(defineProps<{ size?: 'compact' | 'full' }>(), { size: 'compact' })

const route = useRoute()
const { profiles } = useAruna()
const { bridge } = useAssistantEditor()
const {
  busy,
  toolsNote,
  provider,
  providers,
  model,
  modelChoices,
  modelsError,
  loadModels,
  approveWrites,
  historyReady,
  selectProvider,
  selectModel,
  setApproveWrites,
  send,
} = useAssistantChat()

const input = ref('')
const providerOptions = computed(() =>
  providers.value.map((entry) => ({ value: entry.provider_id, label: entry.label })))
const canSend = computed(() =>
  historyReady.value && !busy.value && Boolean(provider.value) && Boolean(model.value) && Boolean(input.value.trim()))

function submit() {
  if (!canSend.value) return
  const text = input.value
  input.value = ''
  void send(text, {
    route: route.fullPath,
    draft: bridge.value?.summary() ?? null,
    profiles: profiles.value.map((profile) => ({ id: profile.id, name: profile.name })),
  })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  submit()
}
</script>

<template>
  <div class="space-y-2">
    <Notice v-if="toolsNote" tone="info">{{ toolsNote }}</Notice>
    <div class="flex items-end gap-2">
      <Textarea
        v-model="input"
        :rows="props.size === 'full' ? 3 : 2"
        class="min-h-0 flex-1 font-sans"
        :class="props.size === 'full' ? 'text-sm' : 'text-xs'"
        placeholder="Ask the assistant"
        aria-label="Message"
        @keydown="onKeydown"
      />
      <div class="flex shrink-0 items-center gap-1">
        <Popover side="top" align="end">
          <Button
            variant="ghost"
            :size="props.size === 'full' ? 'icon' : 'icon-sm'"
            aria-label="Chat settings"
            title="Chat settings"
            @click="loadModels"
          >
            <Settings2 class="size-4" />
          </Button>
          <template #content>
            <div class="space-y-3">
              <div>
                <p class="text-xs font-medium text-foreground">Provider</p>
                <p v-if="providers.length < 2" class="mt-1 truncate text-xs text-muted-foreground">
                  {{ provider?.label ?? 'No provider is ready' }}
                </p>
                <Select
                  v-else
                  :model-value="provider?.provider_id ?? ''"
                  :options="providerOptions"
                  class="mt-1 h-8 text-xs"
                  aria-label="Provider"
                  @update:model-value="selectProvider"
                />
              </div>
              <div>
                <p class="text-xs font-medium text-foreground">Model</p>
                <ModelCombobox
                  :model-value="model"
                  :suggestions="modelChoices"
                  class="mt-1 h-8"
                  aria-label="Model"
                  required
                  @update:model-value="selectModel"
                />
                <p v-if="modelsError" class="mt-1 text-[11px] text-muted-foreground">
                  The model list could not be read: {{ modelsError }}
                </p>
              </div>
              <label class="flex items-center justify-between gap-3 text-xs text-foreground">
                Approve writes
                <Switch :checked="approveWrites" @update:checked="setApproveWrites" />
              </label>
              <Button variant="outline" size="sm" class="w-full" as-child>
                <RouterLink :to="{ name: 'settings', query: { tab: 'assistant' } }">Assistant settings</RouterLink>
              </Button>
            </div>
          </template>
        </Popover>
        <Button :size="props.size === 'full' ? 'default' : 'sm'" :disabled="!canSend" @click="submit">
          <SendHorizontal class="size-4" /> Send
        </Button>
      </div>
    </div>
    <p v-if="props.size === 'full'" class="px-1 text-[11px] text-muted-foreground">
      Enter sends, Shift+Enter starts a new line.
    </p>
  </div>
</template>
