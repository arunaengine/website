<script setup lang="ts">
// The four ways a device surface can have nothing to show, worded once. The
// caller renders its own content for 'idle', 'loading' and 'ready'.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
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
      return props.error || `Could not read ${props.subject}.`
  }
})

const detail = computed(() => {
  switch (props.state) {
    case 'offline':
      return `The node on this machine keeps ${props.subject}. Start it under This device.`
    case 'unsupported':
      return 'Update the node and this fills itself in.'
    case 'forbidden':
      return "The device answers to its owner's own token. Sign in as the account it belongs to."
    default:
      return undefined
  }
})
</script>

<template>
  <p v-if="shown && compact" class="text-sm text-muted-foreground">{{ headline }}</p>

  <ErrorPanel v-else-if="state === 'error'" :message="headline" @retry="emit('retry')" />

  <EmptyState v-else-if="state === 'offline'" :title="headline" :description="detail">
    <Button variant="outline" size="sm" as-child>
      <RouterLink :to="{ name: 'device' }">Open the device page</RouterLink>
    </Button>
  </EmptyState>

  <EmptyState v-else-if="shown" :title="headline" :description="detail" />
</template>
