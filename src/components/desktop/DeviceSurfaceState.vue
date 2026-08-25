<script setup lang="ts">
// The four ways a device surface can have nothing to show, worded once. The
// caller renders its own content for 'idle', 'loading' and 'ready'.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import type { DeviceState } from '@/lib/deviceApi'

const props = withDefaults(
  defineProps<{
    state: DeviceState
    /** What could not be shown, as a noun phrase: "its folders", "its runs". */
    subject: string
    error?: string | null
    /** Inline one-liner for a dashboard card instead of a full block. */
    compact?: boolean
  }>(),
  { error: null, compact: false },
)
const emit = defineEmits<{ (e: 'retry'): void }>()

const shown = computed(() => ['offline', 'unsupported', 'forbidden', 'error'].includes(props.state))

const headline = computed(() => {
  switch (props.state) {
    case 'offline':
      return "This device's node is not running."
    case 'unsupported':
      return `This node version does not serve ${props.subject} yet.`
    case 'forbidden':
      return 'This session cannot manage the device.'
    default:
      return props.error || `${props.subject} could not be read.`
  }
})

const detail = computed(() => {
  switch (props.state) {
    case 'offline':
      return `${props.subject} are kept by the node on this machine. Start it under This device.`
    case 'unsupported':
      return 'Update the node and this fills itself in.'
    case 'forbidden':
      return "The device answers to its owner's own token. Sign in as the account it belongs to."
    default:
      return ''
  }
})
</script>

<template>
  <p v-if="shown && compact" class="text-sm text-muted-foreground">{{ headline }}</p>

  <div
    v-else-if="shown"
    :class="[
      'surface px-5 py-10 text-center',
      state === 'error' ? 'border-destructive/30 bg-destructive/5' : '',
    ]"
  >
    <p :class="['text-sm font-medium', state === 'error' ? 'text-destructive' : 'text-foreground']">
      {{ headline }}
    </p>
    <p v-if="detail" class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{{ detail }}</p>
    <RouterLink v-if="state === 'offline'" :to="{ name: 'device' }" class="mt-4 inline-flex">
      <Button variant="outline" size="sm">Open This device</Button>
    </RouterLink>
    <Button v-else-if="state === 'error'" variant="outline" size="sm" class="mt-4" @click="emit('retry')">
      Try again
    </Button>
  </div>
</template>
