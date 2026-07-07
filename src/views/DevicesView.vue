<script setup lang="ts">
// My devices (aruna#271). Self-service enrollment of personal "user" nodes.
// The whole view is gated behind featureEnabled('deviceEnrollment'): with the
// default config it renders NotFoundView, so /app/settings/devices behaves like
// any unknown /app URL and fires zero device HTTP. The enrollment endpoints do
// not exist on any backend yet (gated on the aruna#272 security guard); the
// wizard renders 403/404/409 verbatim until they land.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import WizardSteps from '@/components/onboarding/WizardSteps.vue'
import KindSelectStep, { type KindOption } from '@/components/onboarding/KindSelectStep.vue'
import SecretPanel from '@/components/onboarding/SecretPanel.vue'
import CodeSnippet from '@/components/onboarding/CodeSnippet.vue'
import ClaimWatchStep, { type WatchStage } from '@/components/onboarding/ClaimWatchStep.vue'
import SecretsTable, { type SecretRow } from '@/components/onboarding/SecretsTable.vue'
import NotFoundView from '@/views/NotFoundView.vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { deviceStatus, useDevices } from '@/composables/useDevices'
import { buildDeviceEnv, normalizeSeedUrl } from '@/lib/onboarding-config'
import { kindVariant, type BadgeVariant } from '@/components/nodes/node-display'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { truncateMiddle } from '@/lib/utils'
import { featureEnabled } from '@/lib/config'
import type { EnrollUserDeviceResponse } from '@/lib/api'
import { ArrowLeft, ArrowRight, ChevronRight, ExternalLink, LogIn, RefreshCw } from '@lucide/vue'

// Read once at setup: config is loaded before app mount, and the route
// component is lazy, so this runs after loadPortalConfig() resolves.
const enabled = featureEnabled('deviceEnrollment')

const { bootstrapped, currentUser, nodeInfo, realmInfo, loadInfo } = useAruna()
const { signIn } = useAuth()
const {
  devices,
  devicesError,
  busy,
  evictingIds,
  deviceCap,
  deviceCount,
  capReached,
  loadDevices,
  ensureDevicesLoaded,
  enrollDevice,
  evictDevice,
} = useDevices()

onMounted(() => {
  if (enabled) void ensureDevicesLoaded()
})
// Re-load on account switch (the composable resets its cache on the same event).
watch(
  () => currentUser.value?.id,
  (id, prev) => {
    if (enabled && id && id !== prev) void ensureDevicesLoaded()
  },
)

function refreshAll() {
  void loadDevices()
  void loadInfo()
}

// --- Enrollment wizard ------------------------------------------------------
const WIZARD_STEPS = ['Device kind', 'Device token', 'Configure device', 'Watch it connect']
const wizardStep = ref(0)

// A single informational kind — the trust copy lives on the radio card, mirroring
// the per-kind warnings in the admin onboarding wizard.
const DEVICE_KIND_OPTIONS: KindOption[] = [
  {
    value: 'user',
    title: 'User device',
    description:
      'A personal device (laptop or workstation) joined as a user node. It is bound to your account at enrollment, never mints tokens, is never part of load-balancer pools and is never a routing target.',
    badgeLabel: 'user',
    badgeVariant: kindVariant.user,
  },
]
const selectedKind = ref<string | null>('user')

const deviceName = ref('')
const advancedOpen = ref(false)

// Seed URL defaults exactly like the admin wizard: the local node's published API
// origin (without /api/v1; the device appends /api/v1/onboarding/bootstrap).
const defaultSeedUrl = computed(() => {
  const localId = nodeInfo.value?.node.peer_id
  const published = realmInfo.value?.nodes.find((n) => n.node_id === localId)?.info?.urls?.api
  const rest = nodeInfo.value?.services.interfaces.rest.url
  const raw = published || rest || (typeof window !== 'undefined' ? window.location.origin : '')
  return normalizeSeedUrl(raw)
})
const seedUrl = ref('')
watch(
  defaultSeedUrl,
  (v) => {
    if (!seedUrl.value && v) seedUrl.value = v
  },
  { immediate: true },
)

const EXPIRY_OPTIONS = [
  { value: '600', label: '10 minutes' },
  { value: '3600', label: '1 hour' },
  { value: '21600', label: '6 hours' },
  { value: '86400', label: '24 hours' },
]
const expiresIn = ref('3600')

const enrollResult = ref<EnrollUserDeviceResponse | null>(null)
const enrollError = ref<string | null>(null)

async function doEnroll() {
  if (busy.value || capReached.value || !seedUrl.value.trim()) return
  enrollError.value = null
  try {
    enrollResult.value = await enrollDevice({
      seed_url: normalizeSeedUrl(seedUrl.value),
      device_name: deviceName.value,
      expires_in_seconds: Number(expiresIn.value),
    })
  } catch (err) {
    // 403 (future #272 guard), 404 (backend without #271) and 409 (server-side
    // cap) all land here honestly.
    enrollError.value = err instanceof Error ? err.message : String(err)
  }
}

// Device-agent .env with the one-time token embedded (single snippet — a laptop
// agent runs the binary directly, so there is no compose block).
const envSnippet = computed(() =>
  enrollResult.value
    ? buildDeviceEnv({
        secret: enrollResult.value.onboarding_secret,
        deviceName: deviceName.value.trim() || undefined,
      })
    : '',
)

// --- Watch step -------------------------------------------------------------
// The row for the enrollment we are watching; presence comes from the shared
// realm info, exactly like the admin onboarding watch.
const enrolledRow = computed(() =>
  enrollResult.value
    ? devices.value.find((d) => d.enrollment_id === enrollResult.value!.enrollment_id) ?? null
    : null,
)
const nowSecs = ref(Date.now() / 1000)

const watchOnline = computed(() => {
  const nid = enrolledRow.value?.node_id
  if (!nid) return false
  return (realmInfo.value?.nodes ?? []).some(
    (n) => n.node_id === nid && n.kind === 'user' && n.connection_status === 'connected',
  )
})
const watchExpired = computed(() => {
  const result = enrollResult.value
  if (!result) return false
  if (enrolledRow.value?.node_id) return false // claimed → never expired
  const exp = enrolledRow.value?.expires_at ?? result.expires_at
  return exp != null && nowSecs.value > exp
})
const watchTerminal = computed<'connected' | 'expired' | null>(() =>
  watchOnline.value ? 'connected' : watchExpired.value ? 'expired' : null,
)

const watchStages = computed<WatchStage[]>(() => {
  const claimedId = enrolledRow.value?.node_id ?? null
  const claimedShort = claimedId ? truncateMiddle(claimedId, 8, 6) : undefined
  const stages: WatchStage[] = [{ key: 'token', label: 'Device token issued', state: 'done' }]
  if (watchExpired.value) {
    stages.push({
      key: 'claimed',
      label: 'Device claimed',
      state: 'failed',
      detail: 'The token expired before the device claimed it.',
    })
    stages.push({ key: 'online', label: 'Device online', state: 'pending' })
    return stages
  }
  if (claimedId) {
    stages.push({ key: 'claimed', label: 'Device claimed', state: 'done', detail: claimedShort })
    stages.push({ key: 'online', label: 'Device online', state: watchOnline.value ? 'done' : 'active' })
    return stages
  }
  stages.push({ key: 'claimed', label: 'Device claimed', state: 'active' })
  stages.push({ key: 'online', label: 'Device online', state: 'pending' })
  return stages
})

// 5s poll: refresh the device list while unclaimed, then the shared realm info
// to pick up presence. No module-level timer — it lives and dies with this view.
let watchTimer: number | undefined
function stopWatch() {
  if (watchTimer !== undefined) {
    window.clearInterval(watchTimer)
    watchTimer = undefined
  }
}
function pollTick() {
  nowSecs.value = Date.now() / 1000
  if (watchTerminal.value) {
    stopWatch()
    return
  }
  const row = enrolledRow.value
  if (!row || !row.node_id) void loadDevices()
  else void loadInfo()
}
function startWatch() {
  stopWatch()
  nowSecs.value = Date.now() / 1000
  watchTimer = window.setInterval(pollTick, 5000)
}
watch(watchTerminal, (t) => {
  if (t) stopWatch()
})
onUnmounted(stopWatch)

function goToWatch() {
  if (!enrollResult.value) return
  wizardStep.value = 3
  startWatch()
}

function resetWizard() {
  stopWatch()
  enrollResult.value = null
  enrollError.value = null
  deviceName.value = ''
  advancedOpen.value = false
  wizardStep.value = 0
  void loadDevices()
}

const watchNodeId = computed(() => enrolledRow.value?.node_id ?? null)

// --- Device table -----------------------------------------------------------
const userNodes = computed(
  () =>
    new Map(
      (realmInfo.value?.nodes ?? []).filter((n) => n.kind === 'user').map((n) => [n.node_id, n]),
    ),
)

const rows = computed<SecretRow[]>(() =>
  devices.value.map((d) => {
    const status = deviceStatus(d)
    if (status === 'pending') {
      return {
        id: d.enrollment_id,
        kindLabel: d.device_name ?? 'device',
        kindVariant: kindVariant.user,
        expiresAt: d.expires_at,
        status: 'outstanding',
        statusLabel: 'pending claim',
      }
    }
    if (status === 'expired') {
      return {
        id: d.enrollment_id,
        kindLabel: d.device_name ?? 'device',
        kindVariant: kindVariant.user,
        expiresAt: d.expires_at,
        status: 'expired',
      }
    }
    // active: presence is read from the realm node list.
    const node = d.node_id ? userNodes.value.get(d.node_id) : undefined
    let statusLabel = 'not in realm'
    let statusVariant: BadgeVariant = 'warn'
    if (node) {
      const connected = node.connection_status === 'connected'
      statusLabel = connected ? 'online' : 'offline'
      statusVariant = connected ? 'success' : 'secondary'
    }
    return {
      id: d.enrollment_id,
      kindLabel: d.device_name ?? 'device',
      kindVariant: kindVariant.user,
      expiresAt: null,
      expiresHint: 'token redeemed',
      status: 'claimed',
      statusLabel,
      statusVariant,
      claimedBy: d.node_id,
      claimedLink:
        d.node_id && userNodes.value.has(d.node_id)
          ? { name: 'status', query: { node: d.node_id } }
          : null,
    }
  }),
)

async function onEvict(id: string) {
  try {
    await evictDevice(id)
  } catch (err) {
    reportGlobalError(err instanceof Error ? err.message : String(err))
  }
}

function startSignIn() {
  void signIn({ redirectTo: '/app/settings/devices' })
}
</script>

<template>
  <!-- Flag off: the URL behaves like any unknown route. -->
  <NotFoundView v-if="!enabled" />

  <div v-else>
    <PageHeader
      title="My devices"
      description="Enroll personal devices as user nodes bound to your account, watch them connect, and evict them again."
    >
      <template #actions>
        <Button variant="outline" @click="refreshAll"><RefreshCw class="h-4 w-4" /> Refresh</Button>
        <RouterLink :to="{ name: 'settings' }">
          <Button variant="outline" size="sm"><ArrowLeft class="h-4 w-4" /> Settings</Button>
        </RouterLink>
      </template>
    </PageHeader>

    <!-- Gate 1: still bootstrapping -->
    <div v-if="!bootstrapped" class="container max-w-[1100px] space-y-4 py-8">
      <Skeleton class="h-24 w-full" />
      <Skeleton class="h-64 w-full" />
    </div>

    <!-- Gate 2: signed out -->
    <div v-else-if="!currentUser" class="container max-w-[1100px] py-8">
      <section class="surface mx-auto max-w-xl p-8 text-center">
        <h2 class="font-display text-base font-semibold text-aruna-navy">Sign in to manage your devices</h2>
        <p class="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
          Devices are bound to your account at enrollment. Sign in to enroll a personal device as a user
          node and manage the ones you already have.
        </p>
        <Button class="mt-5" @click="startSignIn"><LogIn class="h-4 w-4" /> Sign in</Button>
      </section>
    </div>

    <!-- Gated content -->
    <div v-else class="container max-w-[1100px] space-y-6 py-8">
      <ErrorPanel v-if="devicesError" :message="devicesError" @retry="loadDevices" />

      <!-- Cap strip -->
      <div class="flex flex-wrap items-center gap-3">
        <Badge variant="outline" class="tabular-nums">
          {{ deviceCap === null ? `${deviceCount} devices · no realm device limit` : `${deviceCount} of ${deviceCap} devices` }}
        </Badge>
      </div>
      <p
        v-if="capReached"
        class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
      >
        Device limit reached — this realm allows {{ deviceCap }} device(s) per user and you have
        {{ deviceCount }} (pending enrollments count until they expire). Evict a device below to enroll a new one.
      </p>

      <!-- Enrollment wizard -->
      <section class="surface">
        <div class="border-b border-border px-5 py-4">
          <WizardSteps :steps="WIZARD_STEPS" :current="wizardStep" />
        </div>

        <div class="p-5">
          <!-- Step 1 — Kind -->
          <div v-if="wizardStep === 0" class="space-y-5">
            <p class="text-sm text-muted-foreground">
              A personal device joins the realm as a user node. This is what it is trusted to do.
            </p>
            <KindSelectStep
              :options="DEVICE_KIND_OPTIONS"
              :model-value="selectedKind"
              @update:model-value="(v) => (selectedKind = v)"
            />
            <div class="flex justify-end">
              <Button :disabled="!selectedKind" @click="wizardStep = 1">
                Continue <ArrowRight class="h-4 w-4" />
              </Button>
            </div>
          </div>

          <!-- Step 2 — Enroll -->
          <div v-else-if="wizardStep === 1" class="space-y-5">
            <template v-if="!enrollResult">
              <p class="text-sm text-muted-foreground">
                Give the device a name so you can recognize it later. The token below is single-use and shown
                only once.
              </p>
              <div>
                <label class="text-xs font-medium text-foreground">Device name <span class="text-muted-foreground">(optional)</span></label>
                <Input v-model="deviceName" maxlength="64" placeholder="e.g. work-laptop" class="mt-1" />
              </div>

              <div>
                <button
                  type="button"
                  class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  :aria-expanded="advancedOpen"
                  @click="advancedOpen = !advancedOpen"
                >
                  <ChevronRight :class="['h-3.5 w-3.5 transition-transform', advancedOpen && 'rotate-90']" />
                  Advanced
                </button>
                <div v-if="advancedOpen" class="mt-3 space-y-4 rounded-md border border-border bg-muted/20 px-4 py-4">
                  <div>
                    <label class="text-xs font-medium text-foreground">Seed URL</label>
                    <Input v-model="seedUrl" placeholder="https://node.example.org" class="mt-1 font-mono" />
                    <p class="mt-1 text-[11px] text-muted-foreground">
                      Must be reachable from the device; <code class="font-mono">/api/v1</code> is appended automatically.
                    </p>
                  </div>
                  <div class="max-w-xs">
                    <label class="text-xs font-medium text-foreground">Expires after</label>
                    <Select v-model="expiresIn" :options="EXPIRY_OPTIONS" class="mt-1" />
                    <p class="mt-1 text-[11px] text-muted-foreground">The server clamps this to between 1 minute and 24 hours.</p>
                  </div>
                </div>
              </div>

              <p v-if="enrollError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {{ enrollError }}
              </p>
              <div class="flex justify-between">
                <Button variant="outline" @click="wizardStep = 0"><ArrowLeft class="h-4 w-4" /> Back</Button>
                <Button :disabled="busy || capReached || !seedUrl.trim()" @click="doEnroll">
                  {{ busy ? 'Enrolling…' : 'Enroll device' }}
                </Button>
              </div>
            </template>
            <template v-else>
              <SecretPanel
                :secret="enrollResult.onboarding_secret"
                secret-label="Device token"
                :expires-at="enrollResult.expires_at"
                notice="The device token is shown once and is bound to your account. Anyone holding it can enroll a device as you until it expires."
              />
              <div class="flex justify-end">
                <Button @click="wizardStep = 2">
                  Continue to configuration <ArrowRight class="h-4 w-4" />
                </Button>
              </div>
            </template>
          </div>

          <!-- Step 3 — Configure -->
          <div v-else-if="wizardStep === 2" class="space-y-5">
            <p class="text-sm text-muted-foreground">
              Run the aruna binary on the device with this environment. The token is embedded and exists only
              on this page until you leave.
            </p>
            <!-- Single .env snippet — a laptop agent runs the binary directly, so no compose block. -->
            <CodeSnippet
              title="Device agent configuration (.env)"
              :code="envSnippet"
              hint="Boot the device agent with these variables (a .env next to the binary, or the process environment)."
            />
            <div class="flex justify-between">
              <Button variant="outline" @click="wizardStep = 1"><ArrowLeft class="h-4 w-4" /> Back</Button>
              <Button @click="goToWatch"><ArrowRight class="h-4 w-4" /> Watch it connect</Button>
            </div>
          </div>

          <!-- Step 4 — Watch -->
          <div v-else class="space-y-5">
            <p class="text-sm text-muted-foreground">
              Start the device agent with the configuration above. This page polls the realm and updates as the
              device claims its token and connects.
            </p>
            <ClaimWatchStep :stages="watchStages" :error="devicesError">
              <template #actions>
                <RouterLink
                  v-if="watchTerminal === 'connected' && watchNodeId"
                  :to="{ name: 'status', query: { node: watchNodeId } }"
                >
                  <Button size="sm"><ExternalLink class="h-4 w-4" /> Open in Status</Button>
                </RouterLink>
                <Button v-if="watchTerminal === 'connected'" variant="outline" size="sm" @click="resetWizard">Done</Button>
                <Button v-else-if="watchTerminal === 'expired'" variant="outline" size="sm" @click="resetWizard">
                  Enroll again
                </Button>
              </template>
            </ClaimWatchStep>
          </div>
        </div>
      </section>

      <!-- Device list -->
      <section class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-border px-5 py-4">
          <div class="flex items-center gap-2">
            <h3 class="font-display text-sm font-semibold text-aruna-navy">Your devices</h3>
            <Badge variant="outline" class="tabular-nums">{{ devices.length }}</Badge>
          </div>
        </header>
        <div class="p-5">
          <SecretsTable
            :rows="rows"
            :busy-ids="evictingIds"
            :can-revoke="true"
            revoke-label="Evict"
            empty-text="No devices enrolled yet — enroll one above."
            @revoke="onEvict"
          />
          <p class="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            Presence is read from the realm's node list; user devices never mint tokens and are never
            replication or routing targets.
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
