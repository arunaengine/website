<script setup lang="ts">
// My devices (aruna#271). Self-scoped: /access/users/me/devices only ever answers with
// the caller's own user nodes and the enrollments still in flight, so this
// needs no admin gate. Name, state and last contact come from the realm's node list.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import StatusMark from '@/components/ui/StatusMark.vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import DeviceLane from '@/components/onboarding/DeviceLane.vue'
import WizardSteps from '@/components/onboarding/WizardSteps.vue'
import { useAruna } from '@/composables/useAruna'
import { useDeviceEnrollment } from '@/composables/useDeviceEnrollment'
import { Laptop, Plus, Trash2, X } from '@lucide/vue'
import type { UserDevice } from '@/lib/api'
import { relativeTime, truncateMiddle } from '@/lib/utils'
import { isDesktop } from '@/lib/desktop'
import { nodeName, nodeOnline } from '@/components/nodes/node-display'
import NodeNameEdit from '@/components/nodes/NodeNameEdit.vue'
import { useNodeNames } from '@/composables/useNodeNames'

const props = defineProps<{ refreshRevision?: number }>()

const DEVICE_STEPS = ['Device', 'Hand off', 'Watch it join']
const FIRST_STEP = 1

const { currentUser, realmInfo, nodeInfo } = useAruna()
// In the desktop app this computer's own row opens its device page, the others their node details.
const desktop = isDesktop()
const deviceLink = (nodeId: string) =>
  desktop && nodeInfo?.value?.node.peer_id === nodeId ? { name: 'device' } : { name: 'node', params: { nodeId } }
const { devices, devicesError, busyIds, deviceCount, deviceLimit, loadingDevices, loadDevices, revoke } =
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

// The page header's refresh reads the list again.
watch(() => props.refreshRevision, () => {
  if (currentUser.value) void loadDevices()
})

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
  deviceLimit.value == null ? `${deviceCount.value}` : `${deviceCount.value} of ${deviceLimit.value}`,
)

// An enrolled device is a realm member addressed by its node id; the others are an enrollment
// whose code has not landed as a member yet.
interface DeviceRow {
  id: string
  /** Set for an enrolled device: the node id it is renamed by. */
  nodeId: string | null
  name: string | null
  value: string | null
  shortId: string
  status: string
  lastSeen: string
  /** The enrollment id, or the device id once enrolled. */
  enrollmentId: string
}
const { renameDevice } = useNodeNames()
const rows = computed<DeviceRow[]>(() =>
  devices.value.map((device) => {
    const node = (realmInfo.value?.nodes ?? []).find((entry) => entry.node_id === device.node_id)
    // The same reading as the Status page; without a reported contact state it stays unknown.
    const online = node ? nodeOnline({ ...node, kind: 'user' }) : false
    const status = device.status === 'enrolled' ? (node?.connection_status ? (online ? 'online' : 'offline') : 'unknown') : device.status
    const seen = node?.last_seen_ms ? relativeTime(new Date(node.last_seen_ms).toISOString()) : online ? 'just now' : ''
    const nodeId = device.status === 'enrolled' ? device.node_id : null
    // An enrolled device always has a name for people; an enrollment in flight goes by its code id.
    const name = device.status === 'enrolled' ? (node ? nodeName(node) : 'Device') : null
    return { id: device.id, nodeId, name, value: node?.display_name ?? null, shortId: (device.node_id ?? device.id).slice(0, 8), status, lastSeen: seen, enrollmentId: device.enrollment_id ?? device.id }
  }),
)
const confirming = ref('')
function remove(id: string) {
  confirming.value = ''
  void revoke(id)
}
</script>

<template>
  <section aria-labelledby="devices-heading">
    <SectionHeading id="devices-heading" title="Your devices" :icon="Laptop" :level="3" :count="currentUser && !loadingDevices ? capLabel : undefined" info="Computers that run Aruna Desktop under your account.">
      <template #actions>
        <Button v-if="!adding" variant="outline" size="sm" :disabled="!currentUser" @click="openAdd">
          <Plus class="h-3.5 w-3.5" /> Add a device
        </Button>
      </template>
    </SectionHeading>
    <div class="surface overflow-hidden">

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
        <table v-if="rows.length" class="data-table">
          <thead>
            <tr>
              <th class="py-2 pr-4 text-left font-semibold">Name</th>
              <th class="py-2 pr-4 text-left font-semibold">Enrollment id</th>
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
                  <RouterLink v-if="row.name" :to="deviceLink(row.nodeId)" class="text-foreground hover:underline">{{ row.name }}</RouterLink>
                  <span v-else class="font-mono text-xs text-muted-foreground">{{ row.shortId }}</span>
                </NodeNameEdit>
                <span v-else class="inline-flex items-center gap-1">
                  <span v-if="row.name" class="text-foreground">{{ row.name }}</span>
                  <span v-else class="font-mono text-xs text-muted-foreground">{{ row.shortId }}</span>
                </span>
              </td>
              <td class="py-2.5 pr-4">
                <span class="inline-flex items-center gap-1">
                  <code class="font-mono text-xs text-muted-foreground" :title="row.enrollmentId">{{ truncateMiddle(row.enrollmentId) }}</code>
                  <CopyButton :value="row.enrollmentId" label="Copy enrollment id" />
                </span>
              </td>
              <td class="py-2.5 pr-4">
                <span v-if="row.status === 'online'" class="inline-flex items-center gap-1.5"><StatusMark label="Online" size="sm" />Online</span>
                <span v-else class="text-muted-foreground">{{ row.status.charAt(0).toUpperCase() + row.status.slice(1) }}</span>
              </td>
              <td class="py-2.5 pr-4 text-muted-foreground">{{ row.lastSeen || '-' }}</td>
              <td class="py-2.5 text-right">
                <div v-if="confirming === row.id" class="flex items-center justify-end gap-2">
                  <span class="text-xs text-muted-foreground">{{ row.status === 'pending' ? 'Its code stops working.' : 'It has to be enrolled again.' }}</span>
                  <Button variant="outline" size="sm" class="text-destructive hover:text-destructive" :disabled="busyIds.has(row.id)" @click="remove(row.id)"><Trash2 class="h-3.5 w-3.5" /> Remove</Button>
                  <Button variant="ghost" size="sm" @click="confirming = ''">Cancel</Button>
                </div>
                <Button v-else variant="outline" size="sm" class="text-destructive hover:text-destructive" :disabled="busyIds.has(row.id)" @click="confirming = row.id">
                  <Trash2 class="h-3.5 w-3.5" /> {{ busyIds.has(row.id) ? 'Removing…' : 'Remove' }}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-xs text-muted-foreground">No devices on your account yet.</p>
      </template>
    </div>
    </div>
  </section>
</template>
