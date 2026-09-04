<script setup lang="ts">
// The provider, model and approval choices, in one popover shared by the
// composer cogwheel and the model pill in the chat header.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Popover from '@/components/ui/Popover.vue'
import Select from '@/components/ui/Select.vue'
import ModelCombobox from '@/components/assistant/ModelCombobox.vue'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { effortLabel } from '@/lib/assistant/modelOptions'
import { Settings } from '@lucide/vue'

const props = withDefaults(defineProps<{
  side?: 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
}>(), { side: 'top', align: 'end' })

const {
  provider,
  providers,
  model,
  modelChoices,
  modelsError,
  approveWrites,
  reasoningEffort,
  effortOptions,
  selectProvider,
  selectModel,
  setApproveWrites,
  setReasoningEffort,
} = useAssistantChat()

const providerOptions = computed(() =>
  providers.value.map((entry) => ({ value: entry.provider_id, label: entry.label })))

const effortChoices = computed(() =>
  effortOptions.value.map((value) => ({ value, label: effortLabel(value) })))

const writeChoices = [
  { value: 'ask', label: 'Approve every write' },
  { value: 'auto', label: 'Run writes automatically' },
]

</script>

<template>
  <Popover :side="props.side" :align="props.align">
    <slot />
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
          <p class="mt-1 text-[11px] text-muted-foreground">
            Pick an id, or type one and press Enter. Changing the model starts a new chat.
          </p>
          <p v-if="modelsError" class="mt-1 text-[11px] text-muted-foreground">{{ modelsError }}</p>
        </div>
        <div v-if="effortChoices.length">
          <p class="text-xs font-medium text-foreground">Reasoning</p>
          <Select
            :model-value="reasoningEffort"
            :options="effortChoices"
            class="mt-1 h-8 text-xs"
            aria-label="Reasoning"
            @update:model-value="setReasoningEffort"
          />
        </div>
        <div>
          <p class="text-xs font-medium text-foreground">Writes</p>
          <Select
            :model-value="approveWrites ? 'ask' : 'auto'"
            :options="writeChoices"
            class="mt-1 h-8 text-xs"
            aria-label="Writes"
            @update:model-value="(value: string) => setApproveWrites(value === 'ask')"
          />
          <p class="mt-1 text-[11px] text-muted-foreground">
            {{ approveWrites
              ? 'Every write asks you first.'
              : 'Writes run without asking; the chat says what ran.' }}
          </p>
        </div>
        <div class="flex items-center justify-end">
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: 'settings', query: { tab: 'assistant' } }">
              <Settings class="size-3.5 shrink-0" aria-hidden="true" /> Assistant settings
            </RouterLink>
          </Button>
        </div>
      </div>
    </template>
  </Popover>
</template>
