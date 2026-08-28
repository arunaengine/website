<script setup lang="ts">
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'
import { Plus, Trash2 } from '@lucide/vue'
import type { DraftPropertyRule } from '../useProfileBuilder'

const props = defineProps<{
  property: DraftPropertyRule
  // Mirrors the card's kind lock: a structural rule keeps its URL list read-only.
  disabled: boolean
  preserved: boolean
  preservedCount: number
  error: string
}>()

function addUrlOption() {
  props.property.urlOptions.push('')
}

function removeUrlOption(index: number) {
  props.property.urlOptions.splice(index, 1)
}
</script>

<template>
  <div>
    <label class="text-[11px] font-medium text-muted-foreground">Allowed URLs</label>
    <p
      v-if="preserved"
      class="mt-1 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground"
    >
      Preserved from import, {{ preservedCount }} {{ preservedCount === 1 ? 'option' : 'options' }} kept as-is because they include structured (non-URL) values. Edit the option list in Describo/Crate-O.
    </p>
    <template v-else>
    <div class="mt-1 space-y-1.5">
      <div v-for="(_, index) in property.urlOptions" :key="index" class="flex items-center gap-1.5">
        <Input v-model="property.urlOptions[index]" placeholder="https://creativecommons.org/licenses/by/4.0/" :disabled="disabled" />
        <button
          v-if="!disabled"
          type="button"
          class="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
          @click="removeUrlOption(index)"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
    <Button v-if="!disabled" type="button" variant="outline" size="sm" class="mt-1.5" @click="addUrlOption">
      <Plus class="h-3 w-3" /> Add URL
    </Button>
    <p v-if="error" class="mt-1 text-[11px] text-destructive">{{ error }}</p>
    <p v-else class="mt-1 text-[11px] text-muted-foreground">Users pick one of these absolute URLs.</p>
    </template>
  </div>
</template>
