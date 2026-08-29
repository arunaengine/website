<script setup lang="ts">
// Which provider and model answer, and whether writes ask first. One row in
// the panel header, one row above the page's conversation.
import { computed } from 'vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import ModelCombobox from '@/components/assistant/ModelCombobox.vue'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { modelSuggestions } from '@/lib/assistant/modelOptions'

withDefaults(defineProps<{ size?: 'compact' | 'full' }>(), { size: 'compact' })

const { provider, providers, model, approveWrites, selectProvider, selectModel, setApproveWrites } = useAssistantChat()

const providerOptions = computed(() =>
  providers.value.map((entry) => ({ value: entry.provider_id, label: entry.label })))
const suggestions = computed(() => (provider.value ? modelSuggestions(provider.value) : []))
</script>

<template>
  <div class="flex flex-wrap items-center gap-2" :class="size === 'full' ? '' : 'text-[11px]'">
    <Select
      :model-value="provider?.provider_id ?? ''"
      :options="providerOptions"
      :class="size === 'full' ? 'h-9 w-52' : 'h-7 min-w-0 flex-1 text-[11px]'"
      aria-label="Provider"
      @update:model-value="selectProvider"
    />
    <ModelCombobox
      v-if="provider"
      :model-value="model"
      :suggestions="suggestions"
      :class="size === 'full' ? 'h-9 w-64' : 'h-7 min-w-0 flex-1'"
      aria-label="Model"
      required
      @update:model-value="selectModel"
    />
    <label class="flex items-center gap-2 text-muted-foreground" :class="size === 'full' ? 'ml-auto text-xs' : 'w-full text-[11px]'">
      <Switch :checked="approveWrites" @update:checked="setApproveWrites" />
      Approve writes
    </label>
  </div>
</template>
