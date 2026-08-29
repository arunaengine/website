<script setup lang="ts">
// The one action that destroys the local identity, kept on its own tab so it
// cannot be hit while changing a setting.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { useAruna } from '@/composables/useAruna'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { ApiError, apiRequest } from '@/lib/api'
import { wipeDevice } from '@/lib/desktopBridge'
import { errorMessage } from '@/lib/utils'
import { Trash2 } from '@lucide/vue'

// Echoed back to the shell, which demands the phrase before it wipes anything.
const WIPE_PHRASE = 'wipe'

const emit = defineEmits<{ (e: 'wiped'): void }>()

const wipeInput = ref('')
const wipeError = ref<string | null>(null)
const wiping = ref(false)
const { apiBaseUrl, authToken } = useAruna()
const { identity, loaded, status } = useDeviceStatus()

const canWipe = computed(() => wipeInput.value.trim().toLowerCase() === WIPE_PHRASE)

async function evictRealmDevice(): Promise<void> {
  if (!loaded.value || !status.value) throw new Error('Device status is unavailable. Retry before wiping.')
  if (!status.value.enrolled) return
  const nodeId = identity.value?.nodeId ?? status.value.nodeId
  if (!nodeId) throw new Error('The realm could not identify this device. Retry when it is reachable.')
  try {
    await apiRequest<void>(`/users/me/devices/${encodeURIComponent(nodeId)}`, { method: 'DELETE' }, {
      baseUrl: apiBaseUrl.value,
      token: authToken.value,
    })
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err
  }
}

async function wipe(): Promise<void> {
  if (!canWipe.value || wiping.value) return
  wiping.value = true
  wipeError.value = null
  try {
    await evictRealmDevice()
    await wipeDevice(wipeInput.value.trim())
    wipeInput.value = ''
    emit('wiped')
  } catch (err) {
    wipeError.value = errorMessage(err)
  } finally {
    wiping.value = false
  }
}
</script>

<template>
  <div class="surface space-y-3 border-destructive/30 p-5">
    <h3 class="font-display text-sm font-semibold text-destructive">Wipe this device</h3>
    <p class="text-xs leading-relaxed text-muted-foreground">
      Destroys the local identity and everything stored here, and removes the device from the realm. Data that exists
      only on this device is lost, folder bindings included; the files in your synced folders stay on disk. Type
      <code class="font-mono">{{ WIPE_PHRASE }}</code> to confirm.
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <Input v-model="wipeInput" :placeholder="WIPE_PHRASE" class="max-w-[12rem]" aria-label="Wipe confirmation" />
      <Button variant="outline" :disabled="!canWipe || wiping" @click="wipe">
        <Trash2 class="h-3.5 w-3.5" /> {{ wiping ? 'Wiping…' : 'Wipe device' }}
      </Button>
    </div>
    <Notice v-if="wipeError" tone="error">{{ wipeError }}</Notice>
  </div>
</template>
