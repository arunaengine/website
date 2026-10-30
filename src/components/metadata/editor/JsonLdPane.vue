<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Notice from '@/components/ui/Notice.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { analyzeCrateJson } from '@/lib/crateImport'
import { errorMessage } from '@/lib/utils'
import { Check } from '@lucide/vue'

// The crate the editor writes, as text. Apply reads it back only when it is a valid RO-Crate.
const props = defineProps<{ rocrate: unknown }>()
const emit = defineEmits<{
  (e: 'apply', crate: unknown): void
  (e: 'changed', changed: boolean): void
}>()

const original = JSON.stringify(props.rocrate, null, 2)
const text = ref(original)
const error = ref('')
const changed = computed(() => text.value !== original)
watch(changed, (value) => emit('changed', value))

/** Applies the text and says whether it was a valid RO-Crate. */
function apply(): boolean {
  try {
    const { crate } = analyzeCrateJson(text.value, 'ro-crate-metadata.json')
    error.value = ''
    emit('apply', crate)
    return true
  } catch (cause) {
    error.value = errorMessage(cause)
    return false
  }
}
defineExpose({ apply })
</script>

<template>
  <section class="surface space-y-3 p-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="font-display text-sm font-semibold text-aruna-navy">ro-crate-metadata.json</h2>
        <p class="text-xs text-muted-foreground">Edit the JSON-LD directly. Apply reads it back into the editor.</p>
      </div>
      <span class="flex items-center gap-2">
        <CopyButton :value="text" label="Copy the JSON-LD" />
        <Button variant="outline" size="sm" @click="apply"><Check class="h-3.5 w-3.5" /> Apply</Button>
      </span>
    </div>
    <Notice v-if="error" tone="error" title="The JSON-LD could not be read">{{ error }}</Notice>
    <Textarea
      v-model="text"
      rows="28"
      spellcheck="false"
      aria-label="JSON-LD"
      class="font-mono text-xs"
      :invalid="error ? 'error' : undefined"
    />
  </section>
</template>
