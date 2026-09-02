<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Avatar from '@/components/ui/Avatar.vue'
import AccessBadge from '@/components/ui/AccessBadge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Separator from '@/components/ui/Separator.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import DevicesPanel from '@/components/onboarding/DevicesPanel.vue'
import SessionsPanel from '@/components/settings/SessionsPanel.vue'
import S3SessionsPanel from '@/components/settings/S3SessionsPanel.vue'
import AssistantProviders from '@/components/settings/AssistantProviders.vue'
import McpConnect from '@/components/settings/McpConnect.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import { isAssignableProfile, PROFILE_SCOPE_REASON } from '@/lib/profiles/assignable'
import SectionSkeleton from '@/components/ui/SectionSkeleton.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import { useTheme, type ThemeMode } from '@/composables/useTheme'
import { useAruna } from '@/composables/useAruna'
import { useRefresh } from '@/composables/useRefresh'
import { useFirstPaint } from '@/composables/useFirstPaint'
import { useRouteTab } from '@/composables/useRouteTab'
import { useAuth } from '@/composables/useAuth'
import { useWatches } from '@/composables/useWatches'
import { RouterLink, useRouter } from 'vue-router'
import { apiOrigin } from '@/lib/api'
import { errorMessage, relativeTime } from '@/lib/utils'
import { computed, ref, watch } from 'vue'
import { ChevronRight, ExternalLink, Eye, KeyRound, Palette, Rss, Moon, Sun, Monitor, ListChecks, ArrowRight, LogIn, Plus, Save } from '@lucide/vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { SETTINGS_TAB_ANCHORS } from '@/components/layout/nav'

const {
  apiBaseUrl,
  authToken,
  currentUser,
  nodeInfo,
  userInfo,
  myGroups,
  discoverableGroups,
  profiles,
  credentials,
  authError,
  bootstrapped,
  loading,
  sessionEpoch,
  saving,
  refresh,
  setAuthToken,
  setApiBaseUrl,
  updateUserProfile,
  revokeS3Credential,
} = useAruna()
const { signIn, isAuthenticated, authPending, stage, stageError } = useAuth()
// Account-dependent panels paint together with the shared session bootstrap;
// later refreshes update the rendered tab in place.
const painted = useFirstPaint(
  () => bootstrapped.value && !loading.value && !authPending.value,
  () => String(sessionEpoch.value),
)
// Optimistic until a watch request answers 404/403 (mirrors the bell's probe).
const { available: watchesAvailable } = useWatches()

const settingsTabs = [
  { id: 'profile', label: 'Profile' },
  { id: 'groups', label: 'Groups' },
  { id: 'access', label: 'Access & connection' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'appearance', label: 'Appearance' },
] as const
// Links and bookmarks still carry the ids of the tabs merged into `access`.
const legacyTabs: Record<string, string> = { sessions: 'access', connection: 'access' }
const routeTab = useRouteTab(
  [...settingsTabs.map((entry) => entry.id), ...Object.keys(legacyTabs)],
  'profile',
)
const tab = computed({
  get: () => legacyTabs[routeTab.value] ?? routeTab.value,
  set: (next: string) => (routeTab.value = next),
})

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(refresh)
const apiBaseDraft = ref(apiBaseUrl.value)
const tokenDraft = ref(authToken.value)
watch(authToken, (token) => (tokenDraft.value = token))
const onboardingSecret = ref('')
const signingIn = computed(() => stage.value === 'redirecting')

function startSignIn() {
  void signIn({ onboardingSecret: onboardingSecret.value, redirectTo: '/app/settings' })
}
const identityOpen = ref(false)
const name = ref('')
const email = ref('')
const affiliation = ref('')
const orcid = ref('')
const preferredProfileId = ref('')
const profileMessage = ref<string | null>(null)
const profileError = ref<string | null>(null)

watch(currentUser, (user) => {
  name.value = user?.name ?? ''
  email.value = user?.email ?? ''
  affiliation.value = user?.affiliation ?? ''
  orcid.value = user?.orcid ?? ''
  preferredProfileId.value = user?.preferredProfileId ?? ''
}, { immediate: true })

const profileDirty = computed(() => {
  const user = currentUser.value
  if (!user) return false
  return (
    name.value !== (user.name ?? '') ||
    email.value !== (user.email ?? '') ||
    affiliation.value !== (user.affiliation ?? '') ||
    orcid.value !== (user.orcid ?? '') ||
    preferredProfileId.value !== (user.preferredProfileId ?? '')
  )
})

// Editing again invalidates the last save/error feedback.
watch(profileDirty, (dirty) => {
  if (dirty) {
    profileMessage.value = null
    profileError.value = null
  }
})

const preferredProfile = computed(() => profiles.value.find((profile) => profile.id === preferredProfileId.value))

// Only a profile a dataset of yours could actually declare can be the default;
// the editor would silently ignore any other one.
const defaultProfiles = computed(() => profiles.value.filter((profile) =>
  isAssignableProfile(profile) || myGroups.value.some((group) => isAssignableProfile(profile, group.id))))
const hiddenProfiles = computed(() => profiles.value.length - defaultProfiles.value.length)

// The backend advertises {api_base_url}/oai as its OAI-PMH base (aruna
// api/src/routes/oai.rs base_url): prefer the node's own configured REST base
// and fall back to resolving this session's API base against the window origin.
const oaiBaseUrl = computed(() => {
  let base = nodeInfo.value?.services.interfaces.rest.url ?? ''
  if (!base) {
    try {
      base = new URL(apiBaseUrl.value, window.location.origin).toString()
    } catch {
      return ''
    }
  }
  return `${base.replace(/\/+$/, '')}/oai`
})
const oaiIdentifyUrl = computed(() => (oaiBaseUrl.value ? `${oaiBaseUrl.value}?verb=Identify` : ''))

// Swagger UI is served from the API root, not under /api/v1, and not from the
// portal origin, which is a separate listener when the node splits the two.
const swaggerUrl = computed(() => {
  let origin = apiOrigin(apiBaseUrl.value)
  const restUrl = nodeInfo.value?.services.interfaces.rest.url
  if (restUrl) {
    try {
      origin = new URL(restUrl).origin
    } catch {
      // keep the API origin
    }
  }
  return `${origin}/swagger-ui`
})

function saveConnection() {
  const previousBaseUrl = apiBaseUrl.value
  setApiBaseUrl(apiBaseDraft.value)
  // Changing endpoint resets the session; authenticate explicitly after the
  // new endpoint's public realm information has loaded.
  if (apiBaseUrl.value === previousBaseUrl) setAuthToken(tokenDraft.value)
  void refresh()
}

async function saveProfile() {
  profileMessage.value = null
  profileError.value = null
  try {
    await updateUserProfile({
      name: name.value,
      set_attributes: {
        email: email.value,
        affiliation: affiliation.value,
        orcid: orcid.value,
        ...(preferredProfileId.value ? { 'ui.preferred_profile_path': `profiles/${preferredProfileId.value}` } : {}),
      },
    })
    profileMessage.value = 'Profile saved.'
  } catch (err) {
    profileError.value = errorMessage(err)
  }
}

const themeOptions: Array<{ id: ThemeMode; title: string; icon: unknown; preview: string }> = [
  { id: 'light', title: 'Light', icon: Sun, preview: 'linear-gradient(135deg, #ffffff 0%, #edf6ff 100%)' },
  { id: 'dark', title: 'Dark', icon: Moon, preview: 'linear-gradient(135deg, #0B0B0E 0%, #16161A 55%, #335DC6 130%)' },
  { id: 'system', title: 'System', icon: Monitor, preview: 'linear-gradient(90deg, #ffffff 0 50%, #0B0B0E 50% 100%)' },
]
const { mode: appearance, setTheme } = useTheme()
const router = useRouter()

const createGroupOpen = ref(false)
const createCredentialOpen = ref(false)
const revokeError = ref<string | null>(null)

// Revoked/expired credentials linger server-side (soft revoke, no purge
// endpoint); keep the default view clean and reveal them on demand.
const showInactiveCredentials = ref(false)
const inactiveCredentials = computed(() => credentials.value.filter((credential) => credential.status !== 'active'))
const visibleCredentials = computed(() =>
  showInactiveCredentials.value ? credentials.value : credentials.value.filter((credential) => credential.status === 'active'),
)

const groupNames = computed(() => {
  const names = new Map<string, string>()
  for (const group of [...myGroups.value, ...discoverableGroups.value]) names.set(group.id, group.name)
  return names
})

function groupLabel(groupId: string) {
  return groupNames.value.get(groupId) ?? groupId.slice(0, 8)
}

function isExpired(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now()
}

async function revoke(accessKeyId: string) {
  revokeError.value = null
  try {
    await revokeS3Credential(accessKeyId)
  } catch (err) {
    revokeError.value = errorMessage(err)
  }
}
</script>

<template>
  <div>
    <PageHeader title="Settings" description="Your account, groups, access keys and this browser's connection to the realm.">
      <template #actions>
        <RefreshButton :busy="refreshBusy" size="default" @click="onRefresh" />
        <Button v-if="watchesAvailable" variant="outline" size="default" as-child>
          <RouterLink :to="{ name: 'settings-watches' }"><Eye class="h-4 w-4" /> Watched resources</RouterLink>
        </Button>
        <Button v-if="tab === 'profile'" :disabled="!currentUser || saving || !profileDirty" @click="saveProfile"><Save class="h-4 w-4" /> Save profile</Button>
      </template>
    </PageHeader>

    <Tabs v-model="tab">
      <div class="container pt-6">
        <div class="overflow-x-auto">
          <TabsList aria-label="Settings sections">
            <TabsTrigger
              v-for="entry in settingsTabs"
              :key="entry.id"
              :value="entry.id"
              :data-tour="SETTINGS_TAB_ANCHORS[entry.id]"
            >
              {{ entry.label }}
            </TabsTrigger>
          </TabsList>
        </div>
      </div>

      <div v-if="!painted" class="container space-y-5 py-6">
        <SectionSkeleton :lines="4" />
        <SectionSkeleton :lines="3" />
      </div>

      <template v-else>
      <TabsContent value="access" class="container mt-0 min-w-0 space-y-5 py-6">
        <section class="surface">
          <header class="border-b border-border px-5 py-4">
            <h3 class="font-display text-sm font-semibold text-aruna-navy">Session &amp; API connection</h3>
            <p class="text-xs text-muted-foreground">Sign-in is handled by the realm's identity provider; the issued Aruna token authenticates this browser.</p>
          </header>
          <!-- While the stored session restores, show a placeholder instead of
               flashing "Not signed in" plus a Sign in button. -->
          <div v-if="authPending" class="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div class="min-w-0 flex-1 space-y-1.5">
              <Skeleton class="h-4 w-44" />
              <Skeleton class="h-3 w-64" />
            </div>
          </div>
          <!-- Signed in, the sessions panel below already names this browser's
               session and revoking it is the sign-out. -->
          <div v-else-if="!isAuthenticated" class="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div class="text-sm">
              <div class="font-medium text-foreground">Not signed in</div>
              <div class="text-xs text-muted-foreground">Public endpoints only, sign in to manage data.</div>
            </div>
            <Button size="sm" :disabled="signingIn" @click="startSignIn"><LogIn class="h-3.5 w-3.5" /> Sign in</Button>
          </div>
          <div v-if="isAuthenticated && userInfo" class="border-b border-border px-5 py-3">
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              :aria-expanded="identityOpen"
              @click="identityOpen = !identityOpen"
            >
              <ChevronRight :class="['h-3.5 w-3.5 transition-transform', identityOpen && 'rotate-90']" />
              Identity details
            </button>
            <div v-if="identityOpen" class="mt-2 flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <div class="min-w-0 flex-1">
                <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Full user identity</div>
                <code class="mt-0.5 block break-all font-mono text-[11px] leading-relaxed text-foreground/80">{{ userInfo.user.user_id }}</code>
              </div>
              <CopyButton :value="userInfo.user.user_id" label="Copy user identity" />
            </div>
          </div>
          <div v-if="!isAuthenticated && !authPending" class="grid gap-5 border-b border-border p-5 md:grid-cols-2">
            <div>
              <label class="text-xs font-medium text-foreground">Onboarding secret (first admin, optional)</label>
              <Input v-model="onboardingSecret" class="mt-1" type="password" placeholder="Paste onboarding secret" />
              <p class="mt-1 text-[11px] text-muted-foreground">Only for the first user on a fresh node, claims the realm admin role. Applied on the next sign-in.</p>
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Existing API token (advanced)</label>
              <Input v-model="tokenDraft" class="mt-1" type="password" placeholder="Paste Aruna token" />
              <p class="mt-1 text-[11px] text-muted-foreground">Skip single sign-on and authenticate with a previously issued token, then Apply connection.</p>
            </div>
          </div>
          <div class="grid gap-5 p-5 md:grid-cols-2">
            <div>
              <label class="text-xs font-medium text-foreground">API base URL</label>
              <Input v-model="apiBaseDraft" class="mt-1" placeholder="/api/v1" />
              <p class="mt-1 text-[11px] text-muted-foreground">Release builds can pin this with VITE_ARUNA_API_BASE_URL; the /api proxy is development-only.</p>
              <a :href="swaggerUrl" target="_blank" rel="noopener" class="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink class="h-3 w-3" /> API reference (Swagger UI)
              </a>
            </div>
            <div v-if="isAuthenticated">
              <label class="text-xs font-medium text-foreground">Bearer token (advanced)</label>
              <Input v-model="tokenDraft" class="mt-1" type="password" placeholder="Paste Aruna token" />
              <p class="mt-1 text-[11px] text-muted-foreground">Filled automatically by sign-in; paste a token here to authenticate manually.</p>
            </div>
          </div>
          <div class="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
            <div class="text-xs" :class="authError || stageError ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'">
              {{ stageError || authError || '' }}
            </div>
            <Button size="sm" variant="outline" @click="saveConnection">Apply connection</Button>
          </div>
        </section>

        <SessionsPanel />

        <section class="surface overflow-hidden">
          <header class="flex items-center justify-between border-b border-border px-5 py-4">
            <div class="flex items-center gap-2">
              <KeyRound class="h-4 w-4 text-primary" /><h3 class="font-display text-sm font-semibold text-aruna-navy">S3 access keys</h3><Badge size="sm" variant="secondary" class="uppercase">Advanced</Badge><Badge variant="outline" size="count">{{ visibleCredentials.length }}</Badge>
              <button
                v-if="inactiveCredentials.length"
                type="button"
                class="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                @click="showInactiveCredentials = !showInactiveCredentials"
              >
                {{ showInactiveCredentials ? 'Hide inactive' : `Show inactive (${inactiveCredentials.length})` }}
              </button>
            </div>
            <Button size="sm" :disabled="!currentUser" @click="createCredentialOpen = true"><Plus class="h-4 w-4" /> Create key</Button>
          </header>
          <p class="border-b border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground">
            Long-lived S3 access keys for command-line tools and services against this node. They also authenticate the GA4GH TES
            facade over HTTP Basic. They never authenticate the REST API, which takes bearer tokens managed as sessions above.
            A key's secret is shown once and is never stored or activated by the portal; portal storage uses temporary in-memory sessions.
          </p>
          <div class="min-w-0 overflow-x-auto">
            <table class="min-w-max w-full text-sm">
              <thead class="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th class="px-5 py-2 text-left font-semibold">Access key</th><th class="px-5 py-2 text-left font-semibold">Group</th><th class="px-5 py-2 text-left font-semibold">Status</th><th class="px-5 py-2 text-left font-semibold">Expires</th><th class="px-5 py-2"></th></tr></thead>
              <tbody>
                <tr v-for="credential in visibleCredentials" :key="credential.access_key_id" class="border-t border-border"><td class="px-5 py-2.5 font-mono text-[11px] text-foreground">{{ credential.access_key_id }}</td><td class="px-5 py-2.5 text-[11px] text-muted-foreground" :title="credential.group_id">{{ groupLabel(credential.group_id) }}</td><td class="px-5 py-2.5"><Badge size="sm" :variant="credential.status === 'active' ? 'accent' : credential.status === 'revoked' ? 'destructive' : 'secondary'" class="uppercase">{{ credential.status }}</Badge></td><td class="px-5 py-2.5 text-[11px]" :class="isExpired(credential.expires_at) ? 'text-destructive' : 'text-muted-foreground'" :title="new Date(credential.expires_at).toLocaleString()">{{ isExpired(credential.expires_at) ? `expired ${relativeTime(credential.expires_at)}` : relativeTime(credential.expires_at) }}</td><td class="px-5 py-2.5 text-right"><Button v-if="credential.status === 'active'" variant="ghost" size="sm" class="text-destructive hover:text-destructive" :disabled="saving" @click="revoke(credential.access_key_id)">Revoke</Button></td></tr>
                <tr v-if="!visibleCredentials.length">
                  <td colspan="5" class="px-5 py-6 text-center text-xs text-muted-foreground">
                    <template v-if="inactiveCredentials.length">
                      No active S3 access keys.
                      <button type="button" class="text-primary hover:underline" @click="showInactiveCredentials = true">Show inactive ({{ inactiveCredentials.length }})</button>
                    </template>
                    <template v-else>No S3 access keys for the authenticated user.</template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="revokeError" class="border-t border-border px-5 py-2 text-xs text-destructive">{{ revokeError }}</p>
          <CreateCredentialDialog v-model:open="createCredentialOpen" />
        </section>

        <S3SessionsPanel />

        <section class="surface overflow-hidden">
          <DevicesPanel />
        </section>

        <section class="surface">
          <header class="border-b border-border px-5 py-4">
            <div class="flex items-center gap-2"><Rss class="h-4 w-4 text-primary" /><h3 class="font-display text-sm font-semibold text-aruna-navy">Interoperability</h3></div>
            <p class="text-xs text-muted-foreground">Open protocols external services can consume from this node.</p>
          </header>
          <div class="space-y-3 p-5">
            <div>
              <div class="text-sm font-medium text-foreground">OAI-PMH data provider</div>
              <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
                Standard OAI-PMH 2.0 endpoint for metadata harvesters: publicly visible datasets are
                exposed as Dublin Core (<span class="font-mono">oai_dc</span>) records. All six protocol verbs are
                answered over GET or form-encoded POST; the repository has no set hierarchy. Point a harvester at
                the base URL below.
              </p>
              <div class="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-2">
                <code class="min-w-0 break-all font-mono text-[11px] text-foreground">{{ oaiBaseUrl }}</code>
                <CopyButton :value="oaiBaseUrl" label="Copy OAI-PMH base URL" />
                <a v-if="oaiIdentifyUrl" :href="oaiIdentifyUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink class="h-3 w-3" /> Identify
                </a>
              </div>
            </div>
            <Separator />
            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Harvesting external OAI-PMH sources into this node</span>
              <Badge size="sm" variant="outline" class="uppercase">Coming soon</Badge>
            </div>
          </div>
        </section>
      </TabsContent>

      <TabsContent value="profile" class="container mt-0 min-w-0 space-y-5 py-6">
        <section class="surface">
          <header class="border-b border-border px-5 py-4">
            <h3 class="font-display text-sm font-semibold text-aruna-navy">Profile</h3>
            <p class="text-xs text-muted-foreground">Loaded from /access/users/me and saved with PATCH /access/users/me.</p>
          </header>
          <div v-if="currentUser" class="flex items-center gap-4 border-b border-border px-5 py-5">
            <Avatar :user="currentUser" size="lg" />
            <div>
              <div class="font-medium text-foreground">{{ currentUser.name }}</div>
              <div v-if="currentUser.email" class="text-[11px] text-muted-foreground">{{ currentUser.email }}</div>
            </div>
          </div>
          <div v-else class="border-b border-border px-5 py-5 text-sm text-muted-foreground">No authenticated user loaded.</div>
          <div class="grid gap-5 p-5 md:grid-cols-2">
            <div><label class="text-xs font-medium text-foreground">Full name</label><Input v-model="name" class="mt-1" /></div>
            <div><label class="text-xs font-medium text-foreground">Email</label><Input v-model="email" class="mt-1" /></div>
            <div><label class="text-xs font-medium text-foreground">Affiliation</label><Input v-model="affiliation" class="mt-1" /></div>
            <div><label class="text-xs font-medium text-foreground">ORCID</label><Input v-model="orcid" placeholder="0000-0000-0000-0000" class="mt-1" /></div>
          </div>
          <div class="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
            <p class="min-w-0 text-xs" :class="profileError ? 'text-destructive' : profileMessage ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'">
              {{ profileError ?? profileMessage ?? (profileDirty ? 'Unsaved changes.' : '') }}
            </p>
            <Button size="sm" :disabled="!currentUser || saving || !profileDirty" @click="saveProfile">
              <Save class="h-3.5 w-3.5" /> {{ saving ? 'Saving…' : 'Save profile' }}
            </Button>
          </div>
        </section>

        <section class="surface">
          <header class="flex items-center justify-between border-b border-border px-5 py-4">
            <div class="flex items-center gap-2"><ListChecks class="h-4 w-4 text-primary" /><h3 class="font-display text-sm font-semibold text-aruna-navy">Default profile</h3></div>
            <Button variant="outline" size="sm" as-child><RouterLink :to="{ name: 'profiles' }">Browse profiles <ArrowRight class="h-3.5 w-3.5" /></RouterLink></Button>
          </header>
          <div class="grid gap-2 p-5 sm:grid-cols-2">
            <button v-for="profile in defaultProfiles" :key="profile.id" type="button" class="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/40" :class="preferredProfileId === profile.id ? 'border-primary/60 ring-1 ring-primary/30' : ''" @click="preferredProfileId = profile.id">
              <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" :style="{ backgroundColor: profile.iconColor }"><ListChecks class="h-4 w-4" /></span>
              <div class="min-w-0 flex-1"><div class="flex items-center gap-2"><span class="text-sm font-medium text-foreground">{{ profile.name }}</span><Badge v-if="preferredProfileId === profile.id" size="sm" variant="accent" class="uppercase">default</Badge></div><p class="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{{ profile.description }}</p></div>
            </button>
            <div v-if="!defaultProfiles.length" class="text-sm text-muted-foreground">No profile you can use is visible to you.</div>
          </div>
          <p v-if="hiddenProfiles" class="px-5 pb-3 text-[11px] text-muted-foreground">
            {{ PROFILE_SCOPE_REASON }} {{ hiddenProfiles }} {{ hiddenProfiles === 1 ? 'profile is' : 'profiles are' }} not listed here.
          </p>
          <div v-if="preferredProfile" class="border-t border-border bg-muted/20 px-5 py-3 text-[11px] text-muted-foreground">Selected: <span class="font-medium text-foreground">{{ preferredProfile.name }}</span><span v-if="profileDirty">, apply with "Save profile" above.</span></div>
        </section>
      </TabsContent>

      <TabsContent value="groups" class="container mt-0 min-w-0 space-y-5 py-6">
        <section class="surface overflow-hidden">
          <header class="flex items-center justify-between border-b border-border px-5 py-4">
            <div class="flex items-center gap-2"><h3 class="font-display text-sm font-semibold text-aruna-navy">Groups &amp; roles</h3><Badge variant="outline" class="tabular-nums">{{ myGroups.length }} groups</Badge></div>
            <Button size="sm" :disabled="!currentUser" @click="createGroupOpen = true"><Plus class="h-3.5 w-3.5" /> Create group</Button>
          </header>
          <ul class="divide-y divide-border">
            <li v-for="group in myGroups" :key="group.id">
              <RouterLink :to="{ name: 'group', params: { id: group.id } }" class="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40">
                <span class="h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div class="min-w-0 flex-1"><div class="truncate text-sm font-medium text-foreground">{{ group.name }}</div><div class="truncate font-mono text-[10px] text-muted-foreground">{{ group.id }}</div></div>
                <Badge v-if="group.memberCount !== undefined" variant="outline" class="shrink-0 tabular-nums">{{ group.memberCount }} {{ group.memberCount === 1 ? 'member' : 'members' }}</Badge>
                <div class="flex flex-wrap justify-end gap-1"><AccessBadge v-for="role in group.tags" :key="role" :access="role" /></div>
                <ChevronRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </RouterLink>
            </li>
            <li v-if="!myGroups.length" class="p-3">
              <EmptyState compact title="You are not a member of any group yet, create one to get started.">
                <Button v-if="currentUser" variant="outline" size="sm" @click="createGroupOpen = true">
                  <Plus class="h-3.5 w-3.5" /> Create group
                </Button>
              </EmptyState>
            </li>
          </ul>
          <div v-if="discoverableGroups.length" class="border-t border-border">
            <h2 class="px-5 pb-1 pt-4 font-display text-sm font-semibold text-aruna-navy">Other groups in this realm</h2>
            <ul class="divide-y divide-border">
              <li v-for="group in discoverableGroups" :key="group.id">
                <RouterLink :to="{ name: 'group', params: { id: group.id } }" class="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40">
                  <span class="h-2 w-2 shrink-0 rounded-full bg-border" />
                  <div class="min-w-0 flex-1"><div class="truncate text-sm font-medium text-foreground">{{ group.name }}</div><div class="truncate font-mono text-[10px] text-muted-foreground">{{ group.id }}</div></div>
                  <span class="shrink-0 text-[11px] text-muted-foreground">Membership is managed by the group's admins.</span>
                </RouterLink>
              </li>
            </ul>
          </div>
          <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => router.push({ name: 'group', params: { id: group.group_id } })" />
        </section>
      </TabsContent>

      <TabsContent value="assistant" class="container mt-0 min-w-0 space-y-5 py-6">
        <AssistantProviders />
        <McpConnect />
      </TabsContent>

      <TabsContent value="appearance" class="container mt-0 min-w-0 space-y-5 py-6">
        <section class="surface">
          <header class="flex items-center justify-between border-b border-border px-5 py-4"><div class="flex items-center gap-2"><Palette class="h-4 w-4 text-primary" /><h3 class="font-display text-sm font-semibold text-aruna-navy">Appearance</h3></div></header>
          <div class="grid gap-3 p-5 md:grid-cols-3">
            <button v-for="option in themeOptions" :key="option.id" class="flex items-center gap-3 rounded-lg border border-border bg-background/70 p-3 text-left transition-colors hover:border-primary/40" :class="appearance === option.id ? 'border-primary/60 ring-1 ring-primary/30' : ''" @click="setTheme(option.id)"><span class="grid h-12 w-16 shrink-0 place-items-center rounded-md border border-border shadow-inner" :style="{ background: option.preview }"><component :is="option.icon" class="h-4 w-4 text-primary" /></span><div><div class="text-sm font-medium text-foreground">{{ option.title }}</div></div></button>
          </div>
        </section>
      </TabsContent>
      </template>
    </Tabs>
  </div>
</template>
