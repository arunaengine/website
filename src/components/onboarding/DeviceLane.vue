<script setup lang="ts">
// Device lane of the node onboarding wizard (aruna#271). Nothing here calls the
// API: no route mints a device token yet, so the panes render the shape of the
// hand-off and every action that needs a token stays disabled.
import { computed, ref } from 'vue'
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
import { buildDeviceEnv } from '@/lib/onboarding-config'
import {
  ArrowLeft,
  ArrowRight,
  ClipboardPaste,
  Construction,
  Laptop,
  QrCode as QrCodeIcon,
  Terminal,
} from '@lucide/vue'

// Absolute wizard indices; step 0 is the shared audience question.
const AUDIENCE_STEP = 0
const DETAILS_STEP = 1
const HANDOFF_STEP = 2
const WATCH_STEP = 3

defineProps<{ step: number }>()
const emit = defineEmits<{ (e: 'update:step', v: number): void; (e: 'restart'): void }>()

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

const deviceToken = ref<string | null>(null)
const TOKEN_PLACEHOLDER = '<device-token>'

const deepLink = computed(() =>
  deviceToken.value ? `aruna://enroll?secret=${encodeURIComponent(deviceToken.value)}` : null,
)

const envSnippet = computed(() =>
  buildDeviceEnv({
    secret: deviceToken.value ?? TOKEN_PLACEHOLDER,
    deviceName: deviceName.value.trim() || undefined,
  }),
)

const watchStages: WatchStage[] = [
  { key: 'minted', label: 'Device token minted', state: 'pending' },
  { key: 'claim', label: 'Claimed by the device', state: 'pending' },
  { key: 'connect', label: 'Connected to the realm', state: 'pending' },
]
</script>

<template>
  <div class="space-y-5">
    <div
      class="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-800 dark:text-amber-300"
    >
      <Construction class="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p class="font-display text-sm font-semibold">Coming with device enrollment</p>
        <p class="mt-1 text-xs leading-relaxed">
          A device joins as a user node bound to your account: it never stores realm replicas and never routes for other
          members. The routes that mint and watch a device token are not deployed yet, so the steps below preview the
          hand-off and stay disabled.
        </p>
      </div>
    </div>

    <!-- Step 1 — Device -->
    <div v-if="step === DETAILS_STEP" class="space-y-5">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="text-xs font-medium text-foreground" for="device-name">Device name</label>
          <Input id="device-name" v-model="deviceName" placeholder="work-laptop" class="mt-1" />
          <p class="mt-1 text-[11px] text-muted-foreground">
            Shown on Status and emitted as <code class="font-mono">ARUNA_NODE_LABELS=device=…</code>.
          </p>
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Platform</label>
          <Select v-model="platform" :options="PLATFORM_OPTIONS" aria-label="Device platform" class="mt-1" />
          <p class="mt-1 text-[11px] text-muted-foreground">Selects which Aruna Desktop build the hand-off points at.</p>
        </div>
      </div>
      <div class="flex flex-wrap justify-between gap-2">
        <Button variant="outline" @click="emit('update:step', AUDIENCE_STEP)">
          <ArrowLeft class="h-4 w-4" /> Back
        </Button>
        <div class="flex flex-wrap items-center gap-2">
          <Button disabled title="Needs the device enrollment route">Enroll this device</Button>
          <Button variant="outline" @click="emit('update:step', HANDOFF_STEP)">
            Preview the hand-off <ArrowRight class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>

    <!-- Step 2 — Hand off -->
    <div v-else-if="step === HANDOFF_STEP" class="space-y-5">
      <p class="text-sm text-muted-foreground">
        Four ways to carry the one-time token to the device. Each pane fills in once enrollment mints one.
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
            Hands the token to Aruna Desktop for {{ platformLabel }} over an
            <code class="font-mono">aruna://enroll</code> deep link, so it is never pasted by hand.
          </p>
          <Button :disabled="!deepLink" title="Needs the device enrollment route">
            <Laptop class="h-4 w-4" /> Open in Aruna Desktop
          </Button>
        </TabsContent>

        <TabsContent value="qr" class="space-y-3">
          <p class="text-xs leading-relaxed text-muted-foreground">
            For enrolling a second machine: scan it with Aruna Desktop there.
          </p>
          <div class="h-44 w-44 rounded-md border border-border bg-background p-2">
            <QrCode v-if="deepLink" :value="deepLink" label="Device enrollment link" />
            <div
              v-else
              class="grid h-full w-full place-items-center rounded border border-dashed border-border text-center text-[11px] text-muted-foreground"
            >
              <span>The QR appears with the token</span>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="paste" class="space-y-3">
          <SecretPanel v-if="deviceToken" :secret="deviceToken" secret-label="Device token" />
          <p v-else class="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            The one-time token is shown here once, to paste into Aruna Desktop under Enroll.
          </p>
        </TabsContent>

        <TabsContent value="headless" class="space-y-3">
          <CodeSnippet
            title=".env"
            :code="envSnippet"
            hint="For a headless device: boot the aruna binary with this environment. Replace the token placeholder with the minted one."
          />
        </TabsContent>
      </Tabs>

      <div class="flex justify-between">
        <Button variant="outline" @click="emit('update:step', DETAILS_STEP)">
          <ArrowLeft class="h-4 w-4" /> Back
        </Button>
        <Button variant="outline" @click="emit('update:step', WATCH_STEP)">
          Preview the watch step <ArrowRight class="h-4 w-4" />
        </Button>
      </div>
    </div>

    <!-- Step 3 — Watch -->
    <div v-else class="space-y-5">
      <p class="text-sm text-muted-foreground">
        Once the token is redeemed this page follows the device the same way it follows a joining server.
      </p>
      <ClaimWatchStep :stages="watchStages">
        <template #actions>
          <Button variant="outline" size="sm" @click="emit('update:step', HANDOFF_STEP)">
            <ArrowLeft class="h-4 w-4" /> Back
          </Button>
          <Button variant="outline" size="sm" @click="emit('restart')">Start over</Button>
        </template>
      </ClaimWatchStep>
    </div>
  </div>
</template>
