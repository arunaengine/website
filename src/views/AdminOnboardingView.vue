<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import WizardSteps from '@/components/onboarding/WizardSteps.vue'
import KindSelectStep, { type KindOption } from '@/components/onboarding/KindSelectStep.vue'
import SecretPanel from '@/components/onboarding/SecretPanel.vue'
import CodeSnippet from '@/components/onboarding/CodeSnippet.vue'
import ClaimWatchStep, { type WatchStage } from '@/components/onboarding/ClaimWatchStep.vue'
import DeviceLane from '@/components/onboarding/DeviceLane.vue'
import SecretsTable, { type SecretRow } from '@/components/onboarding/SecretsTable.vue'
import { useAruna } from '@/composables/useAruna'
import { useUserDirectory } from '@/composables/useUserDirectory'
import { NEVER_EXPIRES_AFTER, secretStatus, useNodeOnboarding } from '@/composables/useNodeOnboarding'
import { buildComposeSnippet, buildEnvBlock, normalizeSeedUrl, type NodeConfigInput } from '@/lib/onboarding-config'
import { kindVariant } from '@/components/nodes/node-display'
import { shortUserId, truncateMiddle } from '@/lib/utils'
import { apiOrigin, type CreateOnboardingSecretResponse, type OnboardingMode, type RealmNodeInfo } from '@/lib/api'
import { ArrowLeft, ArrowRight, ExternalLink, RefreshCw, ServerCog, ServerCrash, ShieldCheck } from '@lucide/vue'

const { apiBaseUrl, bootstrapped, currentUser, canManageOnboarding, isManagementNode, nodeInfo, realmInfo } = useAruna()
const {
  secrets,
  listError,
  minting,
  mintError,
  revokingIds,
  watch: watchState,
  refreshSecrets,
  mint,
  revoke,
  startWatch,
  resetWatch,
} = useNodeOnboarding()
const { resolveUsers, cachedUser } = useUserDirectory()

// The gate cascade opens the wizard only for a realm admin with the onboarding
// permission ON a management node. Mirrors the honest states AdminView uses.
const canUseWizard = computed(
  () => bootstrapped.value && !!currentUser.value && canManageOnboarding.value && isManagementNode.value,
)

// Refresh the outstanding-secrets list once the gate opens (never on the
// non-management path, so that state fires zero API calls).
let refreshedOnce = false
watch(
  canUseWizard,
  (ok) => {
    if (ok && !refreshedOnce) {
      refreshedOnce = true
      void refreshSecrets()
    }
  },
  { immediate: true },
)

// --- Wizard state ---------------------------------------------------------
// Step 0 picks the lane; the server lane runs 1..4 and the device lane 1..3.
type WizardAudience = 'realm' | 'device'

const SERVER_STEPS = ['Audience', 'Kind', 'Mint secret', 'Configure node', 'Watch it join']
const DEVICE_STEPS = ['Audience', 'Device', 'Hand off', 'Watch it join']

const audience = ref<WizardAudience | null>(null)
const currentStep = ref(0)
const wizardSteps = computed(() => (audience.value === 'device' ? DEVICE_STEPS : SERVER_STEPS))

const AUDIENCE_OPTIONS: KindOption[] = [
  {
    value: 'realm',
    title: 'A server for my realm',
    description: 'Infrastructure you operate: it stores and serves realm data around the clock.',
    badgeLabel: 'realm node',
    badgeVariant: 'sky',
  },
  {
    value: 'device',
    title: 'A device of mine',
    description: 'A laptop or workstation bound to your account. Never a replication or routing target.',
    badgeLabel: 'user device',
    badgeVariant: 'secondary',
  },
]

// Trust-implication copy per mode (verified against bootstrap_onboarding).
const KIND_OPTIONS: KindOption[] = [
  {
    value: 'Management',
    title: 'Management',
    description: 'Full realm control. Use only for infrastructure you operate yourself.',
    badgeLabel: 'highest trust',
    badgeVariant: 'royal',
    warning:
      "Receives a wrapped copy of the realm's private key during bootstrap. Only onboard infrastructure you control and trust completely.",
  },
  {
    value: 'Server',
    title: 'Server',
    description:
      'Stores and replicates data as a realm member. Gets a delegated signature, never the realm key.',
    badgeLabel: 'storage member',
    badgeVariant: 'sky',
  },
]

const selectedMode = ref<OnboardingMode | null>(null)

// Seed URL defaults to the local node's published API url (origin without
// /api/v1); the node appends /api/v1/onboarding/bootstrap itself.
const defaultSeedUrl = computed(() => {
  const localId = nodeInfo.value?.node.peer_id
  const published = realmInfo.value?.nodes.find((n) => n.node_id === localId)?.info?.urls?.api
  const rest = nodeInfo.value?.services.interfaces.rest.url
  // Last resort is the API origin, not the page origin: the portal may be
  // served from a listener of its own.
  const raw = published || rest || (typeof window !== 'undefined' ? apiOrigin(apiBaseUrl.value) : '')
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

const minted = ref<CreateOnboardingSecretResponse | null>(null)
const mintedEnrollmentId = ref<string | null>(null)
let nodesBeforeMint: string[] = []

async function doMint() {
  if (!selectedMode.value || minting.value) return
  nodesBeforeMint = (realmInfo.value?.nodes ?? []).map((n) => n.node_id)
  try {
    const result = await mint({
      seed_url: normalizeSeedUrl(seedUrl.value),
      mode: selectedMode.value,
      expires_in_seconds: Number(expiresIn.value),
    })
    minted.value = result.response
    mintedEnrollmentId.value = result.enrollmentId
  } catch {
    // mintError holds the message; rendered inline below the form.
  }
}

// --- Config generation (step 3) ------------------------------------------
const httpPort = ref('3000')
const p2pPort = ref('3001')
const s3Port = ref('1337')
const dataDir = ref('./aruna-data')
const location = ref('')
// type="number" inputs emit numbers; normalize before any string handling.
function text(value: string | number): string {
  return String(value).trim()
}

const weight = ref<string | number>('')
const labels = ref('')

const configInput = computed<NodeConfigInput>(() => {
  const normalizedWeight = text(weight.value)
  return {
    secret: minted.value?.onboarding_secret ?? '',
    httpPort: Number(httpPort.value) || 3000,
    p2pPort: Number(p2pPort.value) || 3001,
    s3Port: Number(s3Port.value) || 1337,
    dataDir: dataDir.value,
    location: location.value || undefined,
    weight: normalizedWeight === '' ? undefined : Number(normalizedWeight),
    labels: labels.value || undefined,
  }
})
const envBlock = computed(() => buildEnvBlock(configInput.value))
const composeSnippet = computed(() => buildComposeSnippet(configInput.value))

function goToWatch() {
  if (!minted.value) return
  startWatch(mintedEnrollmentId.value, minted.value.expires_at, nodesBeforeMint)
  currentStep.value = 4
}

// A registration claim carries a user id ("{ulid}@{realm}", always containing
// '@') as claimed_node_id, which no iroh node id ever does. This discriminates
// it from the node-boot window, where claimedIsNode is also transiently false
// while the joining node has not yet appeared in realmInfo.nodes.
const isRegistrationClaim = computed(
  () => !!watchState.value.claimedBy && watchState.value.claimedBy.includes('@'),
)

// connected → real node; expired → timed out; registration → a secret redeemed
// at sign-up (claimedBy is a user id, never a node).
const watchTerminal = computed<'connected' | 'expired' | 'registration' | null>(() => {
  const w = watchState.value
  if (w.phase === 'connected') return 'connected'
  if (w.phase === 'expired') return 'expired'
  if (w.phase === 'waiting-presence' && isRegistrationClaim.value) return 'registration'
  return null
})

const watchStages = computed<WatchStage[]>(() => {
  const w = watchState.value
  const claimedShort = w.claimedBy ? truncateMiddle(w.claimedBy, 8, 6) : undefined
  const stages: WatchStage[] = [{ key: 'minted', label: 'Secret minted', state: 'done' }]

  if (w.phase === 'expired') {
    stages.push({
      key: 'claim',
      label: 'Claimed by a node',
      state: 'failed',
      detail: 'The secret expired before any node claimed it.',
    })
    stages.push({ key: 'connect', label: 'Connected to the realm', state: 'pending' })
    return stages
  }

  if (w.claimedBy) {
    const registration = isRegistrationClaim.value
    stages.push({
      key: 'claim',
      label: 'Claimed by a node',
      state: 'done',
      detail: registration ? 'redeemed at registration (admin claim)' : claimedShort,
    })
    if (w.phase === 'connected') {
      stages.push({ key: 'connect', label: 'Connected to the realm', state: 'done', detail: claimedShort })
    } else if (registration) {
      stages.push({
        key: 'connect',
        label: 'Connected to the realm',
        state: 'pending',
        detail: 'Not applicable: the secret was redeemed at sign-up.',
      })
    } else {
      stages.push({ key: 'connect', label: 'Connecting to the realm', state: 'active' })
    }
    return stages
  }

  stages.push({ key: 'claim', label: 'Waiting for a node to claim the secret', state: 'active' })
  stages.push({ key: 'connect', label: 'Connected to the realm', state: 'pending' })
  return stages
})

function reset() {
  resetWatch()
  minted.value = null
  mintedEnrollmentId.value = null
  selectedMode.value = null
  audience.value = null
  currentStep.value = 0
  void refreshSecrets()
}

// --- Outstanding secrets table -------------------------------------------
// Device secrets carry an owner; resolve the ids through the shared directory
// so the column reads like every other user id in the app.
const owners = computed(() => secrets.value.map((s) => s.owner).filter((id): id is string => !!id))
watch(owners, (ids) => void resolveUsers(ids), { immediate: true })

const secretRows = computed<SecretRow[]>(() =>
  secrets.value.map((s) => {
    const never = s.expires_at > NEVER_EXPIRES_AFTER
    const claimedIsNode =
      !!s.claimed_node_id && (realmInfo.value?.nodes ?? []).some((n) => n.node_id === s.claimed_node_id)
    return {
      id: s.enrollment_id,
      kindLabel: s.mode,
      kindVariant: kindVariant[s.mode.toLowerCase() as RealmNodeInfo['kind']] ?? 'outline',
      owner: s.owner ?? null,
      ownerLabel: s.owner
        ? (cachedUser(s.owner)?.name ?? shortUserId(s.owner, owners.value))
        : undefined,
      expiresAt: never ? null : s.expires_at,
      expiresHint: never ? 'initial admin-claim secret' : undefined,
      status: secretStatus(s),
      claimedBy: s.claimed_node_id,
      // A device has no Status row of its own; it is counted there, not listed.
      claimedLink:
        claimedIsNode && s.mode !== 'User' ? { name: 'status', query: { node: s.claimed_node_id! } } : null,
    }
  }),
)

// Management nodes that published a reachable portal (the portal is served from
// each node's REST origin, so strip the /api/v1 suffix off the published url).
const managementPortals = computed(() =>
  (realmInfo.value?.nodes ?? [])
    .filter((n) => n.kind === 'management' && n.info?.urls?.api)
    .map((n) => ({ id: n.node_id, url: normalizeSeedUrl(n.info!.urls!.api!) })),
)
</script>

<template>
  <div>
    <PageHeader
      title="Node onboarding"
      description="Mint single-use secrets, generate the new node's configuration, and watch it join the realm."
    >
      <template #actions>
        <RouterLink :to="{ name: 'admin' }">
          <Button variant="outline" size="sm"><ArrowLeft class="h-4 w-4" /> Admin</Button>
        </RouterLink>
      </template>
    </PageHeader>

    <!-- Gate 1: still bootstrapping -->
    <div v-if="!bootstrapped" class="container max-w-[1100px] space-y-4 py-8">
      <Skeleton class="h-24 w-full" />
      <Skeleton class="h-64 w-full" />
    </div>

    <!-- Gate 2: not a realm admin with the onboarding permission -->
    <div v-else-if="!currentUser || !canManageOnboarding" class="container max-w-[1400px] py-8">
      <section class="surface mx-auto max-w-xl p-8 text-center">
        <ShieldCheck class="mx-auto h-8 w-8 text-muted-foreground/70" />
        <h2 class="mt-3 font-display text-base font-semibold text-aruna-navy">Realm admin access required</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">
          {{
            currentUser
              ? 'Your account does not hold the onboarding permission (WRITE on /{realm}/admin/onboarding) needed to mint node onboarding secrets.'
              : 'Sign in with a realm admin account to mint node onboarding secrets.'
          }}
        </p>
      </section>
    </div>

    <!-- Gate 3: not a management node; honest explainer, no API call -->
    <div v-else-if="!isManagementNode" class="container max-w-[1400px] py-8">
      <section class="surface mx-auto max-w-2xl p-6">
        <div class="flex items-start gap-3">
          <ServerCrash class="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground/70" />
          <div>
            <h2 class="font-display text-base font-semibold text-aruna-navy">Onboarding runs on management nodes</h2>
            <p class="mt-1.5 text-sm text-muted-foreground">
              This is a {{ nodeInfo?.node.capabilities ?? 'non-management' }} node. Onboarding secrets can only be
              minted on a <strong class="font-medium text-foreground">management node</strong>.
            </p>
          </div>
        </div>
        <div v-if="managementPortals.length" class="mt-4 space-y-2">
          <p class="text-xs font-medium text-foreground">Open the portal on a management node:</p>
          <a
            v-for="node in managementPortals"
            :key="node.id"
            :href="node.url"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-1.5 break-all text-sm text-primary hover:underline"
          >
            <ExternalLink class="h-3.5 w-3.5 shrink-0" /> {{ node.url }}
          </a>
        </div>
        <p v-else class="mt-4 text-xs text-muted-foreground">
          No management node has published a reachable portal URL yet. Check the Status page for the realm topology.
        </p>
      </section>
    </div>

    <!-- Gated content: wizard + outstanding secrets -->
    <div v-else class="container max-w-[1100px] space-y-6 py-8">
      <section class="surface">
        <div class="border-b border-border px-5 py-4">
          <WizardSteps :steps="wizardSteps" :current="currentStep" />
        </div>

        <div class="p-5">
          <!-- Step 1: Audience -->
          <div v-if="currentStep === 0" class="space-y-5">
            <p class="text-sm text-muted-foreground">
              Who is this node for? Realm servers and personal devices join under different rules and get different
              trust.
            </p>
            <KindSelectStep
              :options="AUDIENCE_OPTIONS"
              :model-value="audience"
              @update:model-value="(v) => (audience = v as WizardAudience)"
            />
            <div class="flex justify-end">
              <Button :disabled="!audience" @click="currentStep = 1">
                Continue <ArrowRight class="h-4 w-4" />
              </Button>
            </div>
          </div>

          <DeviceLane
            v-else-if="audience === 'device'"
            v-model:step="currentStep"
            @back="currentStep = 0"
            @restart="reset"
          />

          <!-- Step 2: Kind -->
          <div v-else-if="currentStep === 1" class="space-y-5">
            <p class="text-sm text-muted-foreground">
              Choose what the new node is trusted to do in the realm. This is baked into the onboarding secret.
            </p>
            <KindSelectStep
              :options="KIND_OPTIONS"
              :model-value="selectedMode"
              @update:model-value="(v) => (selectedMode = v as OnboardingMode)"
            />
            <div class="flex justify-end">
              <Button :disabled="!selectedMode" @click="currentStep = 2">
                Continue <ArrowRight class="h-4 w-4" />
              </Button>
            </div>
          </div>

          <!-- Step 3: Mint -->
          <div v-else-if="currentStep === 2" class="space-y-5">
            <template v-if="!minted">
              <p class="text-sm text-muted-foreground">
                Minting a <span class="font-medium text-foreground">{{ selectedMode }}</span> onboarding secret. It is
                single-use and shown only once.
              </p>
              <div>
                <label class="text-xs font-medium text-foreground">Seed URL</label>
                <Input v-model="seedUrl" placeholder="https://node.example.org" class="mt-1 font-mono" />
                <p class="mt-1 text-[11px] text-muted-foreground">
                  Must be reachable from the new node; <code class="font-mono">/api/v1</code> is appended automatically.
                </p>
              </div>
              <div class="max-w-xs">
                <label class="text-xs font-medium text-foreground">Expires after</label>
                <Select v-model="expiresIn" :options="EXPIRY_OPTIONS" class="mt-1" />
                <p class="mt-1 text-[11px] text-muted-foreground">The server clamps this to between 1 minute and 24 hours.</p>
              </div>
              <p v-if="mintError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {{ mintError }}
              </p>
              <div class="flex justify-between">
                <Button variant="outline" @click="currentStep = 1"><ArrowLeft class="h-4 w-4" /> Back</Button>
                <Button :disabled="minting || !seedUrl.trim()" @click="doMint">
                  {{ minting ? 'Minting…' : 'Mint secret' }}
                </Button>
              </div>
            </template>
            <template v-else>
              <SecretPanel :secret="minted.onboarding_secret" :expires-at="minted.expires_at" />
              <div class="flex justify-end">
                <Button @click="currentStep = 3">
                  Continue to configuration <ArrowRight class="h-4 w-4" />
                </Button>
              </div>
            </template>
          </div>

          <!-- Step 4: Configure -->
          <div v-else-if="currentStep === 3" class="space-y-5">
            <p class="text-sm text-muted-foreground">
              Configure the new node and copy one of the snippets below onto it. The onboarding secret is embedded in both.
            </p>
            <div class="grid gap-4 sm:grid-cols-3">
              <div>
                <label class="text-xs font-medium text-foreground">HTTP port</label>
                <Input v-model="httpPort" type="number" min="1" class="mt-1" />
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">P2P port</label>
                <Input v-model="p2pPort" type="number" min="1" class="mt-1" />
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">S3 port</label>
                <Input v-model="s3Port" type="number" min="1" class="mt-1" />
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Data directory (host volume)</label>
              <Input v-model="dataDir" class="mt-1 font-mono" />
            </div>
            <div class="grid gap-4 sm:grid-cols-3">
              <div>
                <label class="text-xs font-medium text-foreground">Location <span class="text-muted-foreground">(optional)</span></label>
                <Input v-model="location" placeholder="eu-west" class="mt-1" />
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">Weight <span class="text-muted-foreground">(optional)</span></label>
                <Input v-model="weight" type="number" min="0" placeholder="1" class="mt-1" />
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">Labels <span class="text-muted-foreground">(optional)</span></label>
                <Input v-model="labels" placeholder="k=v,k2=v2" class="mt-1 font-mono" />
              </div>
            </div>

            <CodeSnippet
              title=".env"
              :code="envBlock"
              hint="Boot the node with this environment (docker --env-file, or a .env next to the binary)."
            />
            <CodeSnippet title="docker-compose.yml" :code="composeSnippet" />

            <p class="text-[11px] leading-relaxed text-muted-foreground">
              Realm description and OIDC providers are realm-level and sync automatically during onboarding. Do not set
              them on the new node. The secret above is embedded in these snippets and exists only in this page until you leave.
            </p>

            <div class="flex justify-between">
              <Button variant="outline" @click="currentStep = 2"><ArrowLeft class="h-4 w-4" /> Back</Button>
              <Button @click="goToWatch"><ServerCog class="h-4 w-4" /> Start the node &amp; watch it join</Button>
            </div>
          </div>

          <!-- Step 5: Watch -->
          <div v-else class="space-y-5">
            <p class="text-sm text-muted-foreground">
              Boot the node with the configuration above. This page polls the realm and updates as the node claims the
              secret and connects.
            </p>
            <ClaimWatchStep :stages="watchStages" :error="watchState.lastError">
              <template #actions>
                <RouterLink
                  v-if="watchTerminal === 'connected' && watchState.claimedBy && selectedMode !== 'User'"
                  :to="{ name: 'status', query: { node: watchState.claimedBy } }"
                >
                  <Button size="sm"><ExternalLink class="h-4 w-4" /> Open in Status</Button>
                </RouterLink>
                <Button v-if="watchTerminal" variant="outline" size="sm" @click="reset">
                  {{ watchTerminal === 'expired' ? 'Mint a new secret' : 'Onboard another node' }}
                </Button>
              </template>
            </ClaimWatchStep>
            <p v-if="watchTerminal === 'registration'" class="text-[11px] leading-relaxed text-muted-foreground">
              This secret was redeemed at sign-up to claim the initial realm-admin role, so there is no node to bring
              online.
            </p>
          </div>
        </div>
      </section>

      <!-- Outstanding secrets -->
      <section class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-border px-5 py-4">
          <div class="flex items-center gap-2">
            <ServerCog class="h-4 w-4 text-primary" />
            <h3 class="font-display text-sm font-semibold text-aruna-navy">Outstanding secrets</h3>
          </div>
          <Button variant="outline" size="sm" @click="refreshSecrets"><RefreshCw class="h-3.5 w-3.5" /> Refresh</Button>
        </header>
        <div class="p-5">
          <ErrorPanel v-if="listError" :message="listError" @retry="refreshSecrets" />
          <EmptyState
            v-else-if="!secretRows.length"
            title="No outstanding onboarding secrets"
            description="Mint one above to grow the realm."
          />
          <SecretsTable
            v-else
            :rows="secretRows"
            :busy-ids="[...revokingIds]"
            :can-revoke="true"
            kind-header="Mode"
            :show-owner="true"
            @revoke="revoke"
          />
        </div>
      </section>
    </div>
  </div>
</template>
