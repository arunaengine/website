<script setup lang="ts">
import { ref } from 'vue'
import { Check, Copy } from '@lucide/vue'
import { copyToClipboard } from '@/lib/utils'

const props = defineProps<{ value: string; label?: string }>()

const copied = ref(false)
let timer: number | undefined

async function copy() {
  await copyToClipboard(props.value)
  copied.value = true
  window.clearTimeout(timer)
  timer = window.setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <button
    type="button"
    class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    :aria-label="label ?? 'Copy to clipboard'"
    :title="label ?? 'Copy to clipboard'"
    @click.stop="copy"
  >
    <Check v-if="copied" class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
    <Copy v-else class="h-3.5 w-3.5" />
  </button>
</template>
