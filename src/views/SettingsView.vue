<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Input from '@/components/ui/Input.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import DevicesPanel from '@/components/onboarding/DevicesPanel.vue'
import SessionsPanel from '@/components/settings/SessionsPanel.vue'
import S3SessionsPanel from '@/components/settings/S3SessionsPanel.vue'
import FeatureSettings from '@/components/settings/FeatureSettings.vue'
import AssistantProviders from '@/components/settings/AssistantProviders.vue'
import VaultSettings from '@/components/settings/VaultSettings.vue'
import SharedLinksPanel from '@/components/settings/SharedLinksPanel.vue'
import McpConnect from '@/components/settings/McpConnect.vue'
import LinkAccount from '@/components/federation/LinkAccount.vue'
import LinkedLogins from '@/components/federation/LinkedLogins.vue'
import ProviderLinks from '@/components/auth/ProviderLinks.vue'
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
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { RouterLink } from 'vue-router'
import { apiOrigin } from '@/lib/api'
import { isDesktop } from '@/lib/desktop'
import { errorMessage } from '@/lib/utils'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { ChevronRight, CircleCheck, Code2, ExternalLink, Eye, KeyRound, Laptop, Link2, Lock, Palette, Moon, Sun, Monitor, ListChecks, LogIn, Save, Sparkles, UserRound } from '@lucide/vue'
import { SETTINGS_TAB_ANCHORS } from '@/components/layout/nav'
import { asyncChunkError } from '@/lib/chunk-recovery'

// The desktop's tools, keys and program setup; the web never loads them.
const ConnectTools = defineAsyncComponent({
  loader: () => import('@/components/settings/ConnectTools.vue'),
  onError: asyncChunkError,
})
const desktop = isDesktop()

const {
  apiBaseUrl,
  authToken,
  currentUser,
  nodeInfo,
  userInfo,
  myGroups,
  profiles,
  authError,
  bootstrapped,
  loading,
  sessionEpoch,
  saving,
  refresh,
  setAuthToken,
  setApiBaseUrl,
  updateUserProfile,
} = useAruna()
const { requestSignIn, isAuthenticated, authPending, stage, stageError } = useAuth()
// Account-dependent panels paint together with the shared session bootstrap;
// later refreshes update the rendered tab in place.
const painted = useFirstPaint(
  () => bootstrapped.value && !loading.value && !authPending.value,
  () => String(sessionEpoch.value),
)
// Optimistic until a watch request answers 404/403 (mirrors the bell's probe).
const { available: watchesAvailable } = useWatches()
const { shown } = usePortalFeatures()

const settingsTabs = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'access', label: 'Access', icon: KeyRound },
  { id: 'devices', label: 'Devices', icon: Laptop },
  { id: 'links', label: 'Shared links', icon: Link2 },
  { id: 'assistant', label: 'Assistant', icon: Sparkles },
  { id: 'keys', label: 'Vault', icon: Lock },
  { id: 'appearance', label: 'Appearance', icon: Palette },
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

// One refresh in the header reads the page and every panel's list again.
const panelRevision = ref(0)
const { busy: refreshBusy, refresh: onRefresh } = useRefresh(() => {
  panelRevision.value++
  return refresh()
})
const apiBaseDraft = ref(apiBaseUrl.value)
const tokenDraft = ref(authToken.value)
watch(authToken, (token) => (tokenDraft.value = token))
const onboardingSecret = ref('')
const signingIn = computed(() => stage.value === 'redirecting')

function startSignIn() {
  void requestSignIn({ onboardingSecret: onboardingSecret.value, redirectTo: '/app/settings' })
}
const identityOpen = ref(false)
const name = ref('')
const email = ref('')
const affiliation = ref('')
const orcid = ref('')
const visibility = ref<Record<string, boolean>>({})
const profileFields = computed(() => [...new Set([
  'name', 'email', 'affiliation', 'orcid',
  ...Object.keys(userInfo.value?.user.attributes ?? {}).filter((key) =>
    !key.startsWith('ui.') && !key.startsWith('profile.visibility.')),
])])
const fieldLabels: Record<string, string> = { name: 'Full name', email: 'Email', affiliation: 'Affiliation', orcid: 'ORCID' }
function fieldPublic(key: string): boolean {
  const value = userInfo.value?.user.attributes?.[`profile.visibility.${key}`]
  return value === undefined ? key === 'name' : value === 'public'
}
// Reseed drafts only when the stored values change, not on every profile refresh.
const storedVisibility = () =>
  [userInfo.value?.user.user_id, ...profileFields.value.map((key) => `${key}=${fieldPublic(key)}`)].join('\n')
watch(storedVisibility, () => {
  visibility.value = Object.fromEntries(profileFields.value.map((key) => [key, fieldPublic(key)]))
}, { immediate: true })
const preferredProfileId = ref('')
const profileMessage = ref<string | null>(null)
const profileError = ref<string | null>(null)

const storedProfile = () => {
  const user = currentUser.value
  return [user?.id, user?.name, user?.email, user?.affiliation, user?.orcid, user?.preferredProfileId].join('\n')
}
watch(storedProfile, () => {
  const user = currentUser.value
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
    profileFields.value.some((key) => visibility.value[key] !== fieldPublic(key)) ||
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
  // The shell owns the base in the desktop app; the draft would be stale.
  if (!isDesktop()) setApiBaseUrl(apiBaseDraft.value)
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
        ...Object.fromEntries(profileFields.value
          .filter((key) => visibility.value[key] !== fieldPublic(key))
          .map((key) => [`profile.visibility.${key}`, visibility.value[key] ? 'public' : 'private'])),
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
</script>

<template>
  <div>
    <PageHeader title="Settings" :docs="{ topic: 'storage-access' }">
      <template #actions>
        <RefreshButton :busy="refreshBusy" @click="onRefresh" />
        <Button v-if="watchesAvailable && shown('watches')" variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: 'settings-watches' }"><Eye class="h-4 w-4" /> Watched resources</RouterLink>
        </Button>
        <Button v-if="tab === 'profile'" size="sm" :disabled="!currentUser || saving || !profileDirty" @click="saveProfile"><Save class="h-4 w-4" /> Save profile</Button>
      </template>
    </PageHeader>

    <Tabs v-model="tab">
      <div class="w-full px-4 sm:px-6 pt-6">
        <TabsList aria-label="Settings sections" class="h-auto flex-wrap justify-start">
          <TabsTrigger
            v-for="entry in settingsTabs"
            :key="entry.id"
            :value="entry.id"
            :data-tour="SETTINGS_TAB_ANCHORS[entry.id]"
            class="gap-1.5"
          >
            <component :is="entry.icon" class="h-3.5 w-3.5" /> {{ entry.label }}
          </TabsTrigger>
        </TabsList>
      </div>

      <div v-if="!painted" class="w-full px-4 sm:px-6 space-y-8 py-6">
        <SectionSkeleton :lines="4" />
        <SectionSkeleton :lines="3" />
      </div>

      <template v-else>
      <TabsContent value="access" class="w-full px-4 sm:px-6 mt-0 min-w-0 space-y-8 py-6">
        <ConnectTools v-if="desktop" />
        <section v-if="authPending || !isAuthenticated" class="surface">
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
        </section>

        <SessionsPanel :refresh-revision="panelRevision" />

        <!-- The desktop lists every long-lived key above, with the place it works. -->
        <S3SessionsPanel :keys="shown('s3-keys') && !desktop" :refresh-revision="panelRevision" />
        <!-- API address, bearer token, identity and the API reference, folded away. -->
        <details class="surface overflow-hidden">
          <summary class="cursor-pointer px-5 py-3.5">
            <span class="inline-flex items-center gap-2 font-display text-sm font-semibold text-aruna-navy"><Code2 class="h-4 w-4 text-primary" /> Advanced: API connection</span>
            <span class="block text-xs text-muted-foreground">API address, bearer token and the API reference.</span>
          </summary>
          <div class="border-t border-border">
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
                <div class="text-xs font-semibold text-muted-foreground">Full user identity</div>
                <code class="mt-0.5 block break-all font-mono text-xs leading-relaxed text-foreground/80">{{ userInfo.user.user_id }}</code>
              </div>
              <CopyButton :value="userInfo.user.user_id" label="Copy user identity" />
            </div>
          </div>
          <div v-if="!isAuthenticated && !authPending" class="grid gap-5 border-b border-border p-5 md:grid-cols-2">
            <div>
              <label class="text-xs font-medium text-foreground">Onboarding secret (first admin, optional)</label>
              <Input v-model="onboardingSecret" class="mt-1" type="password" placeholder="Paste onboarding secret" />
              <p class="mt-1 text-xs text-muted-foreground">Only for the first user on a fresh node, claims the realm admin role. Applied on the next sign-in.</p>
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Existing API token (advanced)</label>
              <Input v-model="tokenDraft" class="mt-1" type="password" placeholder="Paste Aruna token" />
              <p class="mt-1 text-xs text-muted-foreground">Skip single sign-on and authenticate with a previously issued token, then Apply connection.</p>
            </div>
          </div>
          <div class="grid gap-5 p-5 md:grid-cols-2">
            <div>
              <template v-if="!isDesktop()">
                <label class="text-xs font-medium text-foreground">API base URL</label>
                <Input v-model="apiBaseDraft" class="mt-1" placeholder="/api/v1" />
                <p class="mt-1 text-xs text-muted-foreground">Release builds can pin this with VITE_ARUNA_API_BASE_URL; the /api proxy is development-only.</p>
              </template>
              <a :href="swaggerUrl" target="_blank" rel="noopener" class="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink class="h-3 w-3" /> API reference (Swagger UI)
              </a>
            </div>
            <div v-if="isAuthenticated">
              <label class="text-xs font-medium text-foreground">Bearer token (advanced)</label>
              <Input v-model="tokenDraft" class="mt-1" type="password" placeholder="Paste Aruna token" />
              <p class="mt-1 text-xs text-muted-foreground">Filled automatically by sign-in; paste a token here to authenticate manually.</p>
            </div>
          </div>
          <div class="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
            <div class="text-xs" :class="authError || stageError ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'">
              {{ stageError || authError || '' }}
            </div>
            <Button size="sm" variant="outline" @click="saveConnection">Apply connection</Button>
          </div>
          </div>
        </details>

      </TabsContent>

      <TabsContent value="devices" class="w-full px-4 sm:px-6 mt-0 min-w-0 space-y-8 py-6">
        <DevicesPanel :refresh-revision="panelRevision" />
      </TabsContent>

      <TabsContent value="links" class="w-full px-4 sm:px-6 mt-0 min-w-0 space-y-8 py-6">
        <SharedLinksPanel :refresh-revision="panelRevision" />
      </TabsContent>

      <TabsContent value="profile" class="w-full px-4 sm:px-6 mt-0 min-w-0 space-y-8 py-6">
        <LinkAccount />
        <section aria-labelledby="settings-profile-heading">
          <SectionHeading id="settings-profile-heading" title="Profile" :icon="UserRound" info="Choose which fields other signed-in users in this realm can see and search.">
            <template v-if="currentUser" #actions>
              <Button variant="outline" size="sm" as-child>
                <RouterLink :to="{ name: 'user', params: { id: currentUser.id } }"><Eye class="h-3.5 w-3.5" /> View public profile</RouterLink>
              </Button>
            </template>
          </SectionHeading>
          <div class="surface">
          <div v-if="currentUser" class="flex items-center gap-4 border-b border-border px-5 py-5">
            <Avatar :user="currentUser" size="lg" />
            <div>
              <div class="font-medium text-foreground">{{ currentUser.name }}</div>
              <div v-if="currentUser.email" class="text-xs text-muted-foreground">{{ currentUser.email }}</div>
            </div>
          </div>
          <div v-else class="border-b border-border px-5 py-5 text-sm text-muted-foreground">No authenticated user loaded.</div>
          <div class="grid gap-5 p-5 md:grid-cols-2">
            <div><label class="text-xs font-medium text-foreground">Full name</label><Input v-model="name" class="mt-1" /></div>
            <div><label class="text-xs font-medium text-foreground">Email</label><Input v-model="email" class="mt-1" /></div>
            <div><label class="text-xs font-medium text-foreground">Affiliation</label><Input v-model="affiliation" class="mt-1" /></div>
            <div><label class="text-xs font-medium text-foreground">ORCID</label><Input v-model="orcid" placeholder="0000-0000-0000-0000" class="mt-1" /></div>
          </div>
          <div class="border-t border-border px-5 py-4">
            <h4 class="text-sm font-medium text-foreground">Public fields</h4>
            <p class="mt-1 text-xs text-muted-foreground">Your name is always public. Realm admins see every field.</p>
            <div class="mt-3 flex flex-wrap gap-x-6 gap-y-3">
              <label v-for="field in profileFields" :key="field" class="flex items-center gap-2 text-sm">
                <input v-model="visibility[field]" type="checkbox" :aria-label="`Make ${fieldLabels[field] ?? field} public`" class="accent-primary" :disabled="!currentUser || saving" />
                {{ fieldLabels[field] ?? field }}
              </label>
            </div>
          </div>
          <div class="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
            <p class="min-w-0 text-xs" :class="profileError ? 'text-destructive' : profileMessage ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'">
              {{ profileError ?? profileMessage ?? (profileDirty ? 'Unsaved changes.' : '') }}
            </p>
            <Button size="sm" :disabled="!currentUser || saving || !profileDirty" @click="saveProfile">
              <Save class="h-3.5 w-3.5" /> {{ saving ? 'Saving…' : 'Save profile' }}
            </Button>
          </div>
          </div>
        </section>

        <section aria-labelledby="settings-default-profile-heading">
          <SectionHeading id="settings-default-profile-heading" title="Default profile" :icon="ListChecks" info="New datasets start with this profile.">
            <template v-if="shown('profiles')" #actions>
              <Button variant="outline" size="sm" as-child><RouterLink :to="{ name: 'profiles' }"><ListChecks class="h-3.5 w-3.5" /> Browse profiles</RouterLink></Button>
            </template>
          </SectionHeading>
          <div class="surface">
          <div class="grid gap-2 p-5 sm:grid-cols-2">
            <button v-for="profile in defaultProfiles" :key="profile.id" type="button" class="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/40" :class="preferredProfileId === profile.id ? 'border-primary/60 ring-1 ring-primary/30' : ''" @click="preferredProfileId = profile.id">
              <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><ListChecks class="h-4 w-4" /></span>
              <div class="min-w-0 flex-1"><div class="flex items-center gap-2"><span class="text-sm font-medium text-foreground">{{ profile.name }}</span><CircleCheck v-if="preferredProfileId === profile.id" class="size-4 shrink-0 text-status-ok" aria-label="Default" /></div><p class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{{ profile.description }}</p></div>
            </button>
            <div v-if="!defaultProfiles.length" class="text-sm text-muted-foreground">No profile you can use is visible to you.</div>
          </div>
          <p v-if="hiddenProfiles" class="px-5 pb-3 text-xs text-muted-foreground">
            {{ PROFILE_SCOPE_REASON }} {{ hiddenProfiles }} {{ hiddenProfiles === 1 ? 'profile is' : 'profiles are' }} not listed here.
          </p>
          <div v-if="preferredProfile" class="border-t border-border bg-muted/20 px-5 py-3 text-xs text-muted-foreground">Selected: <span class="font-medium text-foreground">{{ preferredProfile.name }}</span><span v-if="profileDirty">, apply with "Save profile" above.</span></div>
          </div>
        </section>
        <ProviderLinks />
        <LinkedLogins />
      </TabsContent>

      <TabsContent value="assistant" class="w-full px-4 sm:px-6 mt-0 min-w-0 space-y-8 py-6">
        <AssistantProviders />
        <McpConnect />
      </TabsContent>

      <TabsContent value="keys" class="w-full px-4 sm:px-6 mt-0 min-w-0 space-y-8 py-6">
        <VaultSettings />
      </TabsContent>

      <TabsContent value="appearance" class="w-full px-4 sm:px-6 mt-0 min-w-0 space-y-8 py-6">
        <section aria-labelledby="settings-appearance-heading">
          <SectionHeading id="settings-appearance-heading" title="Appearance" :icon="Palette" />
          <div class="surface grid gap-3 p-5 md:grid-cols-3">
            <button v-for="option in themeOptions" :key="option.id" class="flex items-center gap-3 rounded-lg border border-border bg-background/70 p-3 text-left transition-colors hover:border-primary/40" :class="appearance === option.id ? 'border-primary/60 ring-1 ring-primary/30' : ''" @click="setTheme(option.id)"><span class="grid h-12 w-16 shrink-0 place-items-center rounded-md border border-border shadow-inner" :style="{ background: option.preview }"><component :is="option.icon" class="h-4 w-4 text-primary" /></span><div><div class="text-sm font-medium text-foreground">{{ option.title }}</div></div></button>
          </div>
        </section>
        <FeatureSettings />
      </TabsContent>
      </template>
    </Tabs>
  </div>
</template>
