<script setup lang="ts">
// My devices (aruna#271). Self-scoped: /users/me/devices only ever answers with
// the caller's own user nodes and the enrollments still in flight, so this
// needs no admin gate. Rows reuse SecretsTable through its view-model props.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import DeviceLane from '@/components/onboarding/DeviceLane.vue'
import SecretsTable, { type SecretRow } from '@/components/onboarding/SecretsTable.vue'
import WizardSteps from '@/components/onboarding/WizardSteps.vue'
import { useAruna } from '@/composables/useAruna'
import { useDeviceEnrollment } from '@/composables/useDeviceEnrollment'
import { Plus, RefreshCw, X } from '@lucide/vue'
import type { UserDevice } from '@/lib/api'

const DEVICE_STEPS = ['Device', 'Hand off', 'Watch it join']
const FIRST_STEP = 1

const { currentUser } = useAruna()
const { devices, devicesError, busyIds, deviceCount, deviceLimit, loadDevices, revoke } =
  useDeviceEnrollment()

const adding = ref(false)
const deviceStep = ref(FIRST_STEP)

// The session restores asynchronously, so load once it has a user rather than
// firing an anonymous request at mount.
let loadedOnce = false
watch(
  currentUser,
  (user) => {
    if (!user || loadedOnce) return
    loadedOnce = true
    void loadDevices()
  },
  { immediate: true },
)

function openAdd() {
  deviceStep.value = FIRST_STEP
  adding.value = true
}

function closeAdd() {
  adding.value = false
  deviceStep.value = FIRST_STEP
  void loadDevices()
}

function restart() {
  deviceStep.value = FIRST_STEP
  void loadDevices()
}

const capLabel = computed(() =>
  deviceLimit.value == null
    ? `${deviceCount.value} enrolled`
    : `${deviceCount.value} of ${deviceLimit.value} devices`,
)

// An enrolled device is a realm member addressed by its node id; the other two
// states are an enrollment secret that has not landed as a member yet.
const STATUS: Record<UserDevice['status'], Pick<SecretRow, 'status' | 'statusLabel' | 'statusVariant'>> = {
  enrolled: { status: 'claimed', statusLabel: 'enrolled', statusVariant: 'success' },
  claimed: { status: 'claimed', statusLabel: 'claimed', statusVariant: 'sky' },
  pending: { status: 'outstanding', statusLabel: 'pending', statusVariant: 'outline' },
}

const rows = computed<SecretRow[]>(() =>
  devices.value.map((device) => {
    return {
      id: device.id,
      kindLabel: 'device',
      kindVariant: 'secondary',
      expiresAt: device.expires_at ?? null,
      expiresHint: device.status === 'enrolled' ? 'enrolled devices do not expire' : undefined,
      claimedBy: device.node_id,
      // Devices are summarized on the Status page, never listed, so no row to open.
      claimedLink: null,
      ...STATUS[device.status],
    }
  }),
)
</script>

<template>
  <div>
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div class="min-w-0">
        <h3 class="font-display text-sm font-semibold text-aruna-navy">Devices</h3>
        <p class="text-xs text-muted-foreground">
          Machines enrolled as user nodes under your account. Removing an enrolled device disconnects it from the realm
          and it has to be enrolled again; removing a pending one makes its code unusable.
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <span class="text-[11px] tabular-nums text-muted-foreground">{{ capLabel }}</span>
        <Button variant="outline" size="sm" aria-label="Refresh devices" @click="loadDevices">
          <RefreshCw class="h-3.5 w-3.5" />
        </Button>
        <Button v-if="!adding" size="sm" :disabled="!currentUser" @click="openAdd">
          <Plus class="h-3.5 w-3.5" /> Add a device
        </Button>
      </div>
    </header>

    <div v-if="adding" class="border-b border-border bg-muted/20 px-5 py-4">
      <div class="mb-4 flex items-start justify-between gap-3">
        <WizardSteps :steps="DEVICE_STEPS" :current="deviceStep - 1" />
        <Button variant="ghost" size="icon-sm" aria-label="Close" @click="closeAdd">
          <X class="h-4 w-4" />
        </Button>
      </div>
      <DeviceLane
        v-model:step="deviceStep"
        @back="closeAdd"
        @restart="restart"
        @changed="loadDevices"
      />
    </div>

    <div class="p-5">
      <p v-if="!currentUser" class="text-xs text-muted-foreground">Sign in to see the devices on your account.</p>
      <template v-else>
        <RefusalNote v-if="devicesError" :message="devicesError" class="mb-3" />
        <SecretsTable
          :rows="rows"
          :busy-ids="[...busyIds]"
          :can-revoke="true"
          revoke-label="Remove"
          busy-label="Removing…"
          empty-text="No devices on your account yet."
          @revoke="revoke"
        />
      </template>
    </div>
  </div>
</template>
