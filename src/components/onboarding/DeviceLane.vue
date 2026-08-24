<script setup lang="ts">
// Device lane of the node onboarding wizard (aruna#271). Self-service by
// design: it mirrors the backend's authorize_device_enrollment (a realm member
// with an unrestricted token on a management node) and never the onboarding
// admin gates, so Settings can mount it for any signed-in member.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import ClaimWatchStep, { type WatchStage } from '@/components/onboarding/ClaimWatchStep.vue'
import CodeSnippet from '@/components/onboarding/CodeSnippet.vue'
import QrCode from '@/components/onboarding/QrCode.vue'
import SecretPanel from '@/components/onboarding/SecretPanel.vue'
import { useAruna } from '@/composables/useAruna'
import { useDeviceEnrollment } from '@/composables/useDeviceEnrollment'
import { buildDeviceEnv, managementPortals } from '@/lib/onboarding-config'
import { truncateMiddle } from '@/lib/utils'
import {
  ArrowLeft,
  ArrowRight,
  ClipboardPaste,
  ExternalLink,
  Laptop,
  QrCode as QrCodeIcon,
  ServerCrash,
  ShieldCheck,
  Terminal,
} from '@lucide/vue'

// Absolute wizard indices; step 0 is the shared audience question, which the
// Settings call site skips.
const DETAILS_STEP = 1
const HANDOFF_STEP = 2
const WATCH_STEP = 3

// One hour, the mint default. Long enough to install the desktop app, short
// enough that a code left on screen stops working the same session.
const ENROLLMENT_TTL_SECS = 3600

defineProps<{ step: number }>()
const emit = defineEmits<{
  (e: 'update:step', v: number): void
  (e: 'back'): void
  (e: 'restart'): void
  // A device list rendered next to the lane holds its own state; tell it when
  // an enrollment appeared and when one finished joining.
  (e: 'changed'): void
}>()

const { currentUser, isManagementNode, realmInfo } = useAruna()
const {
  minting,
  mintError,
  minted,
  watch: watchState,
  deviceCount,
  deviceLimit,
  atCap,
  loadDevices,
  mint,
  startWatch,
  resetWatch,
} = useDeviceEnrollment()

const canEnroll = computed(() => !!currentUser.value && isManagementNode.value)
const portals = computed(() => managementPortals(realmInfo.value?.nodes ?? []))

// The gate opens only once bootstrap has answered, so wait for it rather than
// reading an empty device list at mount.
let loadedOnce = false
watch(
  canEnroll,
  (open) => {
    if (!open || loadedOnce) return
    loadedOnce = true
    void loadDevices()
  },
  { immediate: true },
)

const PLATFORM_OPTIONS = [
  { value: 'linux', label: 'Linux' },
  { value: 'macos', label: 'macOS' },
  { value: 'windows', label: 'Windows' },
]
const deviceName = ref('')
const platform = ref('linux')
const platformLabel = computed(
  () => PLATFORM_OPTIONS.find((option) => option.value === platform.value)?.label ?? '',
)

// Opaque: the backend already form-urlencoded secret/seed/realm into it, so it
// goes into the anchor and the QR exactly as received.
const enrollUrl = computed(() => minted.value?.enroll_url ?? null)

const capLabel = computed(() =>
  deviceLimit.value == null
    ? `${deviceCount.value} enrolled — this realm sets no device limit.`
    : `${deviceCount.value} of ${deviceLimit.value} devices.`,
)

const envSnippet = computed(() =>
  buildDeviceEnv({
    secret: minted.value?.onboarding_secret ?? '',
    deviceName: deviceName.value.trim() || undefined,
  }),
)

async function enroll() {
  if (minting.value) return
  try {
    const result = await mint(ENROLLMENT_TTL_SECS)
    startWatch(result.enrollmentId, result.response.expires_at)
    emit('changed')
    emit('update:step', HANDOFF_STEP)
  } catch {
    // mintError holds the message; rendered inline under the form.
  }
}

watch(
  () => watchState.value.phase,
  (phase) => {
    if (phase === 'present') emit('changed')
  },
)

function startOver() {
  resetWatch()
  emit('restart')
}

const watchStages = computed<WatchStage[]>(() => {
  const state = watchState.value
  const short = state.nodeId ? truncateMiddle(state.nodeId, 8, 6) : undefined
  const stages: WatchStage[] = [{ key: 'minted', label: 'Enrollment code created', state: 'done' }]

  if (state.phase === 'expired') {
    stages.push({
      key: 'claim',
      label: 'Claimed by the device',
      state: 'failed',
      detail: 'The code expired before any device claimed it.',
    })
    stages.push({ key: 'join', label: 'Joined the realm', state: 'pending' })
    return stages
  }

  const claimed = state.phase === 'claimed' || state.phase === 'present'
  const joined = state.phase === 'present'
  stages.push({
    key: 'claim',
    label: claimed ? 'Claimed by the device' : 'Waiting for the device to claim the code',
    state: claimed ? 'done' : 'active',
    detail: claimed ? short : undefined,
  })
  stages.push({
    key: 'join',
    label: joined ? 'Joined the realm' : 'Joining the realm',
    state: joined ? 'done' : claimed ? 'active' : 'pending',
    detail: joined ? short : undefined,
  })
  return stages
})
</script>

<template>
  <div class="space-y-5">
    <!-- Gate 1: device enrollment is bound to the caller's credential -->
    <section v-if="!currentUser" class="surface p-6 text-center">
      <ShieldCheck class="mx-auto h-7 w-7 text-muted-foreground/70" />
      <h3 class="mt-2 font-display text-sm font-semibold text-aruna-navy">Sign in to enroll a device</h3>
      <p class="mt-1 text-xs text-muted-foreground">
        A device is bound to your account at enrollment, so the code is minted against the credential you are signed in
        with. A path-restricted token cannot enroll one.
      </p>
    </section>

    <!-- Gate 2: only a management node redeems enrollment, so only it may mint -->
    <section v-else-if="!isManagementNode" class="surface p-6">
      <div class="flex items-start gap-3">
        <ServerCrash class="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground/70" />
        <div>
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Enrollment runs on management nodes</h3>
          <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
            This node cannot redeem an enrollment, so it cannot mint one either. Open the portal on a management node to
            add a device.
          </p>
        </div>
      </div>
      <div v-if="portals.length" class="mt-4 space-y-2">
        <a
          v-for="portal in portals"
          :key="portal.id"
          :href="portal.url"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1.5 break-all text-sm text-primary hover:underline"
        >
          <ExternalLink class="h-3.5 w-3.5 shrink-0" /> {{ portal.url }}
        </a>
      </div>
    </section>

    <template v-else>
      <!-- Step 1 — Device -->
      <div v-if="step === DETAILS_STEP" class="space-y-5">
        <p class="text-sm text-muted-foreground">
          A device joins as a user node bound to your account: it never stores realm replicas and never routes for other
          members. Enrolling mints a one-time code you carry to the device.
        </p>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="text-xs font-medium text-foreground" for="device-name">Device name</label>
            <Input id="device-name" v-model="deviceName" placeholder="work-laptop" class="mt-1" />
            <p class="mt-1 text-[11px] text-muted-foreground">
              Used for the headless snippet's <code class="font-mono">ARUNA_NODE_LABELS=device=…</code>; Aruna Desktop
              asks for its own name.
            </p>
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Platform</label>
            <Select v-model="platform" :options="PLATFORM_OPTIONS" aria-label="Device platform" class="mt-1" />
            <p class="mt-1 text-[11px] text-muted-foreground">Selects which Aruna Desktop build the hand-off names.</p>
          </div>
        </div>
        <p class="text-[11px] text-muted-foreground">
          {{ capLabel }} Enrolled devices and codes you have not redeemed yet both take a slot.
        </p>
        <p
          v-if="mintError"
          class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {{ mintError }}
        </p>
        <div class="flex flex-wrap justify-between gap-2">
          <Button variant="outline" @click="emit('back')"><ArrowLeft class="h-4 w-4" /> Back</Button>
          <Button v-if="minted" variant="outline" @click="emit('update:step', HANDOFF_STEP)">
            Back to the hand-off <ArrowRight class="h-4 w-4" />
          </Button>
          <Button v-else :disabled="minting || atCap" @click="enroll">
            {{ minting ? 'Enrolling…' : 'Enroll this device' }}
          </Button>
        </div>
        <p v-if="atCap && !minted" class="text-[11px] text-muted-foreground">
          You hold every device this realm allows. Remove one under Settings → Devices to enroll another.
        </p>
      </div>

      <!-- Step 2 — Hand off -->
      <div v-else-if="step === HANDOFF_STEP" class="space-y-5">
        <p class="text-sm text-muted-foreground">
          Four ways to carry the one-time code to the device. It is shown only here, and only until it expires.
        </p>
        <Tabs default-value="desktop">
          <TabsList>
            <TabsTrigger value="desktop"><Laptop class="mr-1 h-3.5 w-3.5" /> Open in Aruna Desktop</TabsTrigger>
            <TabsTrigger value="qr"><QrCodeIcon class="mr-1 h-3.5 w-3.5" /> QR</TabsTrigger>
            <TabsTrigger value="paste"><ClipboardPaste class="mr-1 h-3.5 w-3.5" /> Paste</TabsTrigger>
            <TabsTrigger value="headless"><Terminal class="mr-1 h-3.5 w-3.5" /> Headless env</TabsTrigger>
          </TabsList>

          <TabsContent value="desktop" class="space-y-3">
            <p class="text-xs leading-relaxed text-muted-foreground">
              Hands the code to Aruna Desktop for {{ platformLabel }} over an
              <code class="font-mono">aruna://enroll</code> deep link, so it is never pasted by hand.
            </p>
            <Button v-if="enrollUrl" as="a" :href="enrollUrl"><Laptop class="h-4 w-4" /> Open in Aruna Desktop</Button>
            <p v-else class="text-xs text-muted-foreground">This node returned no deep link for the enrollment.</p>
          </TabsContent>

          <TabsContent value="qr" class="space-y-3">
            <p class="text-xs leading-relaxed text-muted-foreground">
              For enrolling a second machine: scan it with Aruna Desktop there.
            </p>
            <div v-if="enrollUrl" class="h-44 w-44 rounded-md border border-border bg-background p-2">
              <QrCode :value="enrollUrl" label="Device enrollment link" />
            </div>
            <p v-else class="text-xs text-muted-foreground">This node returned no deep link for the enrollment.</p>
          </TabsContent>

          <TabsContent value="paste" class="space-y-3">
            <SecretPanel
              v-if="minted"
              :secret="minted.onboarding_secret"
              secret-label="Enrollment code"
              :expires-at="minted.expires_at"
              notice="The code is shown once. Paste it into Aruna Desktop under Enroll; it cannot be retrieved later."
            />
          </TabsContent>

          <TabsContent value="headless" class="space-y-3">
            <CodeSnippet
              title=".env"
              :code="envSnippet"
              hint="For a headless device: boot the aruna binary with this environment. The code carries the node's own seed URL, so nothing else has to be configured."
            />
          </TabsContent>
        </Tabs>

        <div class="flex justify-between">
          <Button variant="outline" @click="emit('update:step', DETAILS_STEP)">
            <ArrowLeft class="h-4 w-4" /> Back
          </Button>
          <Button @click="emit('update:step', WATCH_STEP)">
            Watch it join <ArrowRight class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <!-- Step 3 — Watch -->
      <div v-else class="space-y-5">
        <p class="text-sm text-muted-foreground">
          This page polls the enrollment until the device redeems the code and appears in the realm. A device never
          publishes presence, so membership is the last stage there is to see.
        </p>
        <ClaimWatchStep :stages="watchStages" :error="watchState.lastError">
          <template #actions>
            <RouterLink :to="{ name: 'settings', hash: '#devices' }">
              <Button variant="outline" size="sm"><ExternalLink class="h-4 w-4" /> My devices</Button>
            </RouterLink>
            <Button variant="outline" size="sm" @click="emit('update:step', HANDOFF_STEP)">
              <ArrowLeft class="h-4 w-4" /> Hand-off
            </Button>
            <Button v-if="watchState.phase === 'expired'" size="sm" @click="startOver">Start over</Button>
            <Button v-else-if="watchState.phase === 'present'" variant="outline" size="sm" @click="startOver">
              Enroll another device
            </Button>
          </template>
        </ClaimWatchStep>
      </div>
    </template>
  </div>
</template>
