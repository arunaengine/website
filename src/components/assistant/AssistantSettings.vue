<script setup lang="ts">
// The provider, model and approval choices, in one popover shared by the
// composer cogwheel and the model pill in the chat header.
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Popover from '@/components/ui/Popover.vue'
import Select from '@/components/ui/Select.vue'
import ModelCombobox from '@/components/assistant/ModelCombobox.vue'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { effortLabel, isValidModelId, normalizeModelId } from '@/lib/assistant/modelOptions'
import { Save, Settings } from '@lucide/vue'

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

// The id typed into the model field; Save applies it once it is valid and new.
const modelDraft = ref(model.value)
const canSave = computed(() =>
  isValidModelId(modelDraft.value) && normalizeModelId(modelDraft.value) !== normalizeModelId(model.value))
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
            @update:draft="(value: string) => (modelDraft = value)"
          />
          <p class="mt-1 text-[11px] text-muted-foreground">
            Pick an id or type one, then press Enter or Save. Changing the model starts a new chat.
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
        <div class="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: 'settings', query: { tab: 'assistant' } }">
              <Settings class="size-3.5 shrink-0" aria-hidden="true" /> Assistant settings
            </RouterLink>
          </Button>
          <Button size="sm" :disabled="!canSave" @click="selectModel(normalizeModelId(modelDraft))">
            <Save class="size-3.5 shrink-0" aria-hidden="true" /> Save
          </Button>
        </div>
      </div>
    </template>
  </Popover>
</template>
