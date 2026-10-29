<script setup lang="ts">
// My devices (aruna#271). Self-scoped: /access/users/me/devices only ever answers with
// the caller's own user nodes and the enrollments still in flight, so this
// needs no admin gate. Name, state and last contact come from the realm's node list.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import DeviceLane from '@/components/onboarding/DeviceLane.vue'
import WizardSteps from '@/components/onboarding/WizardSteps.vue'
import { useAruna } from '@/composables/useAruna'
import { useDeviceEnrollment } from '@/composables/useDeviceEnrollment'
import { useRefresh } from '@/composables/useRefresh'
import { Plus, X } from '@lucide/vue'
import type { UserDevice } from '@/lib/api'
import { relativeTime } from '@/lib/utils'
import { nodeName } from '@/components/nodes/node-display'
import NodeNameEdit from '@/components/nodes/NodeNameEdit.vue'
import { useNodeNames } from '@/composables/useNodeNames'

const DEVICE_STEPS = ['Device', 'Hand off', 'Watch it join']
const FIRST_STEP = 1

const { currentUser, realmInfo } = useAruna()
const { devices, devicesError, busyIds, deviceCount, deviceLimit, loadingDevices, loadDevices, revoke } =
  useDeviceEnrollment()

const adding = ref(false)
const deviceStep = ref(FIRST_STEP)
const { busy: refreshBusy, refresh: onRefresh } = useRefresh(loadDevices)
const spinning = computed(() => refreshBusy.value || loadingDevices.value)

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

// An enrolled device is a realm member addressed by its node id; the others are an enrollment
// whose code has not landed as a member yet.
type Variant = 'success' | 'secondary' | 'outline' | 'sky'
interface DeviceRow {
  id: string
  /** Set for an enrolled device: the node id it is renamed by. */
  nodeId: string | null
  name: string | null
  value: string | null
  shortId: string
  status: string
  variant: Variant
  lastSeen: string
}
const { renameDevice } = useNodeNames()
const rows = computed<DeviceRow[]>(() =>
  devices.value.map((device) => {
    const node = (realmInfo.value?.nodes ?? []).find((entry) => entry.node_id === device.node_id)
    // User nodes report recent contact as `seen`, and no status says offline, so the rest is unknown.
    const online = node?.connection_status === 'connected' || node?.connection_status === 'seen'
    const status = device.status === 'enrolled' ? (online ? 'online' : 'unknown') : device.status
    const variant: Variant = status === 'online' ? 'success' : status === 'claimed' ? 'sky' : status === 'pending' ? 'outline' : 'secondary'
    const seen = node?.last_seen_ms ? relativeTime(new Date(node.last_seen_ms).toISOString()) : online ? 'just now' : ''
    const nodeId = device.status === 'enrolled' ? device.node_id : null
    // An enrolled device always has a name for people; an enrollment in flight goes by its code id.
    const name = device.status === 'enrolled' ? (node ? nodeName(node) : 'Device') : null
    return { id: device.id, nodeId, name, value: node?.display_name ?? null, shortId: (device.node_id ?? device.id).slice(0, 8), status, variant, lastSeen: seen }
  }),
)
const confirming = ref('')
function remove(id: string) {
  confirming.value = ''
  void revoke(id)
}
</script>

<template>
  <div>
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div class="min-w-0">
        <h3 class="font-display text-sm font-semibold text-aruna-navy">Your devices</h3>
        <p class="text-xs text-muted-foreground">Computers that run Aruna Desktop under your account.</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <span class="text-[11px] tabular-nums text-muted-foreground">{{ capLabel }}</span>
        <RefreshButton :busy="spinning" sr-label="Refresh devices" @click="onRefresh" />
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
        closes
        @back="closeAdd"
        @restart="restart"
        @changed="loadDevices"
      />
    </div>

    <div class="p-5">
      <p v-if="!currentUser" class="text-xs text-muted-foreground">Sign in to see the devices on your account.</p>
      <template v-else>
        <RefusalNote v-if="devicesError" :message="devicesError" class="mb-3" />
        <table v-if="rows.length" class="w-full text-sm">
          <thead class="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th class="py-2 pr-4 text-left font-semibold">Name</th>
              <th class="py-2 pr-4 text-left font-semibold">Status</th>
              <th class="py-2 pr-4 text-left font-semibold">Last seen</th>
              <th class="py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="border-t border-border">
              <td class="py-2.5 pr-4">
                <!-- The owner names an enrolled device; an enrollment in flight has no node to name yet. -->
                <NodeNameEdit v-if="row.nodeId" :name="row.name ?? row.shortId" :value="row.value" :save="(name) => renameDevice(row.nodeId!, name)">
                  <span v-if="row.name" class="text-foreground">{{ row.name }}</span>
                  <span class="font-mono text-[11px] text-muted-foreground" :class="row.name ? 'ml-1.5' : ''">{{ row.shortId }}</span>
                </NodeNameEdit>
                <template v-else>
                  <span v-if="row.name" class="text-foreground">{{ row.name }}</span>
                  <span class="font-mono text-[11px] text-muted-foreground" :class="row.name ? 'ml-1.5' : ''">{{ row.shortId }}</span>
                </template>
              </td>
              <td class="py-2.5 pr-4"><Badge size="sm" :variant="row.variant">{{ row.status }}</Badge></td>
              <td class="py-2.5 pr-4 text-[11px] text-muted-foreground">{{ row.lastSeen || 'unknown' }}</td>
              <td class="py-2.5 text-right">
                <div v-if="confirming === row.id" class="flex items-center justify-end gap-2">
                  <span class="text-[11px] text-muted-foreground">{{ row.status === 'pending' ? 'Its code stops working.' : 'It has to be enrolled again.' }}</span>
                  <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" :disabled="busyIds.has(row.id)" @click="remove(row.id)">Remove</Button>
                  <Button variant="ghost" size="sm" @click="confirming = ''">Cancel</Button>
                </div>
                <Button v-else variant="ghost" size="sm" class="text-destructive hover:text-destructive" :disabled="busyIds.has(row.id)" @click="confirming = row.id">
                  {{ busyIds.has(row.id) ? 'Removing…' : 'Remove' }}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-xs text-muted-foreground">No devices on your account yet.</p>
      </template>
    </div>
  </div>
</template>
