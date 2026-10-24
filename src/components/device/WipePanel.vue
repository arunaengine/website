<script setup lang="ts">
// The one action that destroys the local identity, kept at the foot of the page
// and behind a typed word so it cannot be hit while changing a setting.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { useAruna } from '@/composables/useAruna'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useRealm } from '@/composables/useRealm'
import { ApiError, apiRequest } from '@/lib/api'
import { WIPE_PHRASE, wipeDevice } from '@/lib/desktopBridge'
import { errorMessage } from '@/lib/utils'
import { Trash2 } from '@lucide/vue'

// An app that cannot start has no node to name itself, so it skips the realm step.
const props = withDefaults(defineProps<{ realm?: boolean }>(), { realm: true })
const emit = defineEmits<{ (e: 'wiped'): void }>()
const armed = ref(false)

const wipeInput = ref('')
const wipeError = ref<string | null>(null)
const wiping = ref(false)
const { apiBaseUrl, authToken } = useAruna()
const { identity, loaded, status } = useDeviceStatus()
const { realm: realmInfo } = useRealm()

const canWipe = computed(() => wipeInput.value.trim().toLowerCase() === WIPE_PHRASE)

async function evictRealmDevice(): Promise<void> {
  if (!loaded.value || !status.value) throw new Error('Device status is unavailable. Retry before wiping.')
  if (!status.value.enrolled) return
  const nodeId = identity.value?.nodeId ?? status.value.nodeId
  if (!nodeId) throw new Error('The realm could not identify this device. Retry when it is reachable.')
  try {
    await apiRequest<void>(`/access/users/me/devices/${encodeURIComponent(nodeId)}`, { method: 'DELETE' }, {
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
    if (props.realm) await evictRealmDevice()
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
  <section class="surface space-y-3 border-destructive/30 px-5 py-4">
    <h2 class="font-display text-sm font-semibold text-destructive">Remove this computer</h2>
    <p class="text-xs leading-relaxed text-muted-foreground">
      Takes this computer out of {{ realmInfo.name }} and deletes the data Aruna keeps here. Data that exists only on
      this computer is lost, and your folder links disappear. Files in your linked folders stay on disk.
    </p>
    <Button v-if="!armed" variant="outline" size="sm" @click="armed = true">
      <Trash2 class="h-3.5 w-3.5" /> Remove this computer…
    </Button>
    <template v-else>
      <p class="text-xs leading-relaxed text-muted-foreground">
        Type <code class="font-mono">{{ WIPE_PHRASE }}</code> to confirm.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <Input v-model="wipeInput" :placeholder="WIPE_PHRASE" class="max-w-[12rem]" aria-label="Wipe confirmation" />
        <Button variant="destructive" size="sm" :disabled="!canWipe || wiping" @click="wipe">
          <Trash2 class="h-3.5 w-3.5" /> {{ wiping ? 'Removing…' : 'Remove this computer' }}
        </Button>
        <Button variant="ghost" size="sm" :disabled="wiping" @click="((armed = false), (wipeInput = ''))">Cancel</Button>
      </div>
    </template>
    <Notice v-if="wipeError" tone="error">{{ wipeError }}</Notice>
  </section>
</template>
