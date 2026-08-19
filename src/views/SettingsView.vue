<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Avatar from '@/components/ui/Avatar.vue'
import AccessBadge from '@/components/ui/AccessBadge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Separator from '@/components/ui/Separator.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import GroupDetail from '@/components/groups/GroupDetail.vue'
import CopyButton from '@/components/nodes/CopyButton.vue'
import { useTheme, type ThemeMode } from '@/composables/useTheme'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useWatches } from '@/composables/useWatches'
import { useS3 } from '@/composables/useS3'
import { RouterLink, useRoute } from 'vue-router'
import { apiOrigin } from '@/lib/api'
import { relativeTime } from '@/lib/utils'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronRight, ExternalLink, KeyRound, Palette, Rss, Moon, Sun, Monitor, ListChecks, ArrowRight, LogIn, LogOut, Plus, RefreshCw, Save } from '@lucide/vue'

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
  saving,
  refresh,
  setAuthToken,
  setApiBaseUrl,
  updateUserProfile,
  revokeS3Credential,
} = useAruna()
const { signIn, signOut, isAuthenticated, authPending, stage, stageError } = useAuth()
const { activeKey, clearActiveKey } = useS3()
const route = useRoute()
// Optimistic until a watch request answers 404/403 (mirrors the bell's probe).
const { available: watchesAvailable } = useWatches()

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
    profileError.value = err instanceof Error ? err.message : String(err)
  }
}

const themeOptions: Array<{ id: ThemeMode; title: string; icon: unknown; preview: string }> = [
  { id: 'light', title: 'Light', icon: Sun, preview: 'linear-gradient(135deg, #ffffff 0%, #edf6ff 100%)' },
  { id: 'dark', title: 'Dark', icon: Moon, preview: 'linear-gradient(135deg, #0B0B0E 0%, #16161A 55%, #335DC6 130%)' },
  { id: 'system', title: 'System', icon: Monitor, preview: 'linear-gradient(90deg, #ffffff 0 50%, #0B0B0E 50% 100%)' },
]
const { mode: appearance, setTheme } = useTheme()

const settingsSections = [
  { id: 'connection', label: 'API connection' },
  { id: 'profile', label: 'Profile' },
  { id: 'default-profile', label: 'Default profile' },
  { id: 'groups', label: 'Groups & roles' },
  { id: 'credentials', label: 'S3 credentials' },
  { id: 'interop', label: 'Interoperability' },
  { id: 'appearance', label: 'Appearance' },
] as const
type SettingsSectionId = (typeof settingsSections)[number]['id']

const activeSettingsSection = ref<SettingsSectionId>('connection')
const mobileSettingsTabs = ref<HTMLElement | null>(null)
const showMobileTabsStartFade = ref(false)
const showMobileTabsEndFade = ref(false)
let settingsScrollFrame: number | null = null

function settingsSectionFromHash(hash: string): SettingsSectionId | null {
  const id = hash.replace(/^#/, '')
  return settingsSections.some((section) => section.id === id) ? (id as SettingsSectionId) : null
}

function updateMobileTabFades() {
  const tabs = mobileSettingsTabs.value
  if (!tabs) return
  showMobileTabsStartFade.value = tabs.scrollLeft > 2
  showMobileTabsEndFade.value = tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 2
}

function revealMobileTab(tab: HTMLElement) {
  const tabs = mobileSettingsTabs.value
  if (!tabs) return

  const visibleLeft = tabs.scrollLeft + 4
  const visibleRight = tabs.scrollLeft + tabs.clientWidth - 40
  const tabLeft = tab.offsetLeft
  const tabRight = tabLeft + tab.offsetWidth
  if (tabLeft >= visibleLeft && tabRight <= visibleRight) return

  const left = tabLeft < visibleLeft ? tabLeft - 4 : tabRight - tabs.clientWidth + 40
  tabs.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
}

function setActiveSettingsSection(sectionId: SettingsSectionId) {
  if (activeSettingsSection.value === sectionId) return
  activeSettingsSection.value = sectionId
  void nextTick(() => {
    const tab = mobileSettingsTabs.value?.querySelector<HTMLElement>(`a[href="#${sectionId}"]`)
    if (tab) revealMobileTab(tab)
  })
}

function revealFocusedMobileTab(event: FocusEvent) {
  if (event.currentTarget instanceof HTMLElement) revealMobileTab(event.currentTarget)
}

function onMobileTabsKeydown(event: KeyboardEvent) {
  if (!(event.currentTarget instanceof HTMLElement) || !(event.target instanceof HTMLAnchorElement)) return
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('a'))
  const currentIndex = tabs.indexOf(event.target)
  if (currentIndex < 0) return

  let nextIndex: number | null = null
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
  if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = tabs.length - 1
  if (nextIndex === null) return

  event.preventDefault()
  tabs[nextIndex]?.focus()
  if (tabs[nextIndex]) revealMobileTab(tabs[nextIndex])
}

function updateActiveSettingsSection() {
  const lastSection = settingsSections[settingsSections.length - 1]
  if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
    setActiveSettingsSection(lastSection.id)
    return
  }

  let current: SettingsSectionId = settingsSections[0].id
  for (const section of settingsSections) {
    const target = document.getElementById(section.id)
    if (!target || target.getBoundingClientRect().top > 80) break
    current = section.id
  }
  setActiveSettingsSection(current)
}

function scheduleActiveSettingsSectionUpdate() {
  if (settingsScrollFrame !== null) return
  settingsScrollFrame = window.requestAnimationFrame(() => {
    settingsScrollFrame = null
    updateActiveSettingsSection()
  })
}

function onSettingsViewportResize() {
  updateMobileTabFades()
  scheduleActiveSettingsSectionUpdate()
}

watch(
  () => route.hash,
  (hash) => {
    const section = settingsSectionFromHash(hash)
    if (section) setActiveSettingsSection(section)
  },
  { immediate: true },
)
watch(watchesAvailable, () => void nextTick(updateMobileTabFades))

onMounted(() => {
  window.addEventListener('scroll', scheduleActiveSettingsSectionUpdate, { passive: true })
  window.addEventListener('resize', onSettingsViewportResize)
  void nextTick(updateMobileTabFades)
  scheduleActiveSettingsSectionUpdate()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', scheduleActiveSettingsSectionUpdate)
  window.removeEventListener('resize', onSettingsViewportResize)
  if (settingsScrollFrame !== null) window.cancelAnimationFrame(settingsScrollFrame)
})

const createGroupOpen = ref(false)
const createCredentialOpen = ref(false)
const revokeError = ref<string | null>(null)
const selectedGroupId = ref('')

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
    if (activeKey.value?.accessKeyId === accessKeyId) clearActiveKey()
  } catch (err) {
    revokeError.value = err instanceof Error ? err.message : String(err)
  }
}

function toggleGroup(groupId: string) {
  selectedGroupId.value = selectedGroupId.value === groupId ? '' : groupId
}
</script>

<template>
  <div>
    <PageHeader title="Settings" description="API connection, current user, profiles, groups and credentials from the local Aruna API.">
      <template #actions>
        <Button variant="outline" @click="refresh"><RefreshCw class="h-4 w-4" /> Refresh</Button>
        <Button :disabled="!currentUser || saving || !profileDirty" @click="saveProfile"><Save class="h-4 w-4" /> Save profile</Button>
      </template>
    </PageHeader>

    <div class="container grid min-w-0 gap-6 py-8 lg:grid-cols-[260px_1fr]">
      <nav class="hidden flex-col gap-1 text-sm lg:flex">
        <a
          v-for="section in settingsSections"
          :key="section.id"
          :href="'#' + section.id"
          class="rounded-md px-3 py-2"
          :class="activeSettingsSection === section.id ? 'bg-primary/5 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
        >{{ section.label }}</a>
        <RouterLink v-if="watchesAvailable" :to="{ name: 'settings-watches' }" class="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">Watched resources &rarr;</RouterLink>
      </nav>

      <div class="relative min-w-0 lg:hidden">
        <nav
          ref="mobileSettingsTabs"
          aria-label="Settings sections"
          class="scrollbar-thin flex min-w-0 gap-1 overflow-x-auto border-y border-border/70 py-2 pr-10 text-sm"
          @keydown="onMobileTabsKeydown"
          @scroll="updateMobileTabFades"
        >
          <a
            v-for="section in settingsSections"
            :key="section.id"
            :href="'#' + section.id"
            :aria-current="activeSettingsSection === section.id ? 'location' : undefined"
            class="shrink-0 rounded-md px-3 py-1.5 transition-colors hover:bg-muted hover:text-foreground"
            :class="activeSettingsSection === section.id ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground'"
            @click="setActiveSettingsSection(section.id)"
            @focus="revealFocusedMobileTab"
          >
            {{ section.label }}
          </a>
          <RouterLink
            v-if="watchesAvailable"
            :to="{ name: 'settings-watches' }"
            class="shrink-0 rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            @focus="revealFocusedMobileTab"
          >
            Watched resources &rarr;
          </RouterLink>
        </nav>
        <div v-if="showMobileTabsStartFade" aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent" />
        <div v-if="showMobileTabsEndFade" aria-hidden="true" class="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
      </div>

      <div class="min-w-0 space-y-6">
        <section id="connection" class="surface scroll-mt-20 lg:scroll-mt-[4.5rem]">
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
          <div v-else class="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div class="text-sm">
              <div class="font-medium text-foreground">{{ isAuthenticated ? `Signed in as ${currentUser?.name}` : 'Not signed in' }}</div>
              <div class="text-xs text-muted-foreground">{{ isAuthenticated ? 'Authenticated endpoints are available.' : 'Public endpoints only, sign in to manage data.' }}</div>
            </div>
            <Button v-if="isAuthenticated" variant="outline" size="sm" @click="signOut"><LogOut class="h-3.5 w-3.5" /> Sign out</Button>
            <Button v-else size="sm" :disabled="signingIn" @click="startSignIn"><LogIn class="h-3.5 w-3.5" /> Sign in</Button>
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

        <section id="profile" class="surface scroll-mt-20 lg:scroll-mt-[4.5rem]">
          <header class="border-b border-border px-5 py-4">
            <h3 class="font-display text-sm font-semibold text-aruna-navy">Profile</h3>
            <p class="text-xs text-muted-foreground">Loaded from /users/info and saved with PATCH /users/info.</p>
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

        <section id="default-profile" class="surface scroll-mt-20 lg:scroll-mt-[4.5rem]">
          <header class="flex items-center justify-between border-b border-border px-5 py-4">
            <div class="flex items-center gap-2"><ListChecks class="h-4 w-4 text-primary" /><h3 class="font-display text-sm font-semibold text-aruna-navy">Default metadata profile</h3></div>
            <RouterLink :to="{ name: 'profiles' }"><Button variant="outline" size="sm">Browse profiles <ArrowRight class="h-3.5 w-3.5" /></Button></RouterLink>
          </header>
          <div class="grid gap-2 p-5 sm:grid-cols-2">
            <button v-for="profile in profiles" :key="profile.id" type="button" class="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/40" :class="preferredProfileId === profile.id ? 'border-primary/60 ring-1 ring-primary/30' : ''" @click="preferredProfileId = profile.id">
              <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" :style="{ backgroundColor: profile.iconColor }"><ListChecks class="h-4 w-4" /></span>
              <div class="min-w-0 flex-1"><div class="flex items-center gap-2"><span class="text-sm font-medium text-foreground">{{ profile.name }}</span><Badge v-if="preferredProfileId === profile.id" variant="accent" class="text-[10px] uppercase">default</Badge></div><p class="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{{ profile.description }}</p></div>
            </button>
            <div v-if="!profiles.length" class="text-sm text-muted-foreground">No visible profile documents.</div>
          </div>
          <div v-if="preferredProfile" class="border-t border-border bg-muted/20 px-5 py-3 text-[11px] text-muted-foreground">Selected: <span class="font-medium text-foreground">{{ preferredProfile.name }}</span><span v-if="profileDirty">, apply with "Save profile" above.</span></div>
        </section>

        <section id="groups" class="surface scroll-mt-20 overflow-hidden lg:scroll-mt-[4.5rem]">
          <header class="flex items-center justify-between border-b border-border px-5 py-4">
            <div class="flex items-center gap-2"><h3 class="font-display text-sm font-semibold text-aruna-navy">Groups &amp; roles</h3><Badge variant="outline" class="tabular-nums">{{ myGroups.length }} groups</Badge></div>
            <Button size="sm" :disabled="!currentUser" @click="createGroupOpen = true"><Plus class="h-3.5 w-3.5" /> Create group</Button>
          </header>
          <ul class="divide-y divide-border">
            <li v-for="group in myGroups" :key="group.id">
              <button type="button" class="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40" :class="selectedGroupId === group.id ? 'bg-muted/30' : ''" @click="toggleGroup(group.id)">
                <span class="h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div class="min-w-0 flex-1"><div class="truncate text-sm font-medium text-foreground">{{ group.name }}</div><div class="truncate font-mono text-[10px] text-muted-foreground">{{ group.id }}</div></div>
                <Badge v-if="group.memberCount !== undefined" variant="outline" class="shrink-0 tabular-nums">{{ group.memberCount }} {{ group.memberCount === 1 ? 'member' : 'members' }}</Badge>
                <div class="flex flex-wrap justify-end gap-1"><AccessBadge v-for="role in group.tags" :key="role" :access="role" /></div>
              </button>
              <div v-if="selectedGroupId === group.id" class="border-t border-border bg-muted/10 p-4">
                <GroupDetail :group-id="group.id" @left="selectedGroupId = ''" />
              </div>
            </li>
            <li v-if="!myGroups.length" class="px-5 py-6 text-center text-xs text-muted-foreground">
              <p>You are not a member of any group yet, create one to get started.</p>
              <Button v-if="currentUser" variant="outline" size="sm" class="mt-3" @click="createGroupOpen = true">
                <Plus class="h-3.5 w-3.5" /> Create group
              </Button>
            </li>
          </ul>
          <div v-if="discoverableGroups.length" class="border-t border-border">
            <div class="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Other groups in this realm</div>
            <ul class="divide-y divide-border">
              <li v-for="group in discoverableGroups" :key="group.id">
                <button type="button" class="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40" :class="selectedGroupId === group.id ? 'bg-muted/30' : ''" @click="toggleGroup(group.id)">
                  <span class="h-2 w-2 shrink-0 rounded-full bg-border" />
                  <div class="min-w-0 flex-1"><div class="truncate text-sm font-medium text-foreground">{{ group.name }}</div><div class="truncate font-mono text-[10px] text-muted-foreground">{{ group.id }}</div></div>
                  <span class="shrink-0 text-[11px] text-muted-foreground">Membership is managed by the group's admins.</span>
                </button>
                <div v-if="selectedGroupId === group.id" class="border-t border-border bg-muted/10 p-4">
                  <GroupDetail :group-id="group.id" />
                </div>
              </li>
            </ul>
          </div>
          <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => (selectedGroupId = group.group_id)" />
        </section>

        <section id="credentials" class="surface scroll-mt-20 overflow-hidden lg:scroll-mt-[4.5rem]">
          <header class="flex items-center justify-between border-b border-border px-5 py-4">
            <div class="flex items-center gap-2">
              <KeyRound class="h-4 w-4 text-primary" /><h3 class="font-display text-sm font-semibold text-aruna-navy">S3 credentials</h3><Badge variant="outline">{{ visibleCredentials.length }}</Badge>
              <button
                v-if="inactiveCredentials.length"
                type="button"
                class="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                @click="showInactiveCredentials = !showInactiveCredentials"
              >
                {{ showInactiveCredentials ? 'Hide inactive' : `Show inactive (${inactiveCredentials.length})` }}
              </button>
            </div>
            <Button size="sm" @click="createCredentialOpen = true"><Plus class="h-4 w-4" /> Create</Button>
          </header>
          <div class="min-w-0 overflow-x-auto">
            <table class="min-w-max w-full text-sm">
              <thead class="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th class="px-5 py-2 text-left font-semibold">Access key</th><th class="px-5 py-2 text-left font-semibold">Group</th><th class="px-5 py-2 text-left font-semibold">Status</th><th class="px-5 py-2 text-left font-semibold">Expires</th><th class="px-5 py-2"></th></tr></thead>
              <tbody>
                <tr v-for="credential in visibleCredentials" :key="credential.access_key_id" class="border-t border-border"><td class="px-5 py-2.5 font-mono text-[11px] text-foreground">{{ credential.access_key_id }}<Badge v-if="credential.access_key_id === activeKey?.accessKeyId" variant="accent" class="ml-2 text-[9px] uppercase">this device</Badge></td><td class="px-5 py-2.5 text-[11px] text-muted-foreground" :title="credential.group_id">{{ groupLabel(credential.group_id) }}</td><td class="px-5 py-2.5"><Badge :variant="credential.status === 'active' ? 'accent' : credential.status === 'revoked' ? 'destructive' : 'secondary'" class="uppercase text-[10px]">{{ credential.status }}</Badge></td><td class="px-5 py-2.5 text-[11px]" :class="isExpired(credential.expires_at) ? 'text-destructive' : 'text-muted-foreground'" :title="new Date(credential.expires_at).toLocaleString()">{{ isExpired(credential.expires_at) ? `expired ${relativeTime(credential.expires_at)}` : relativeTime(credential.expires_at) }}</td><td class="px-5 py-2.5 text-right"><Button v-if="credential.status === 'active'" variant="ghost" size="sm" class="text-destructive hover:text-destructive" :disabled="saving" @click="revoke(credential.access_key_id)">Revoke</Button></td></tr>
                <tr v-if="!visibleCredentials.length">
                  <td colspan="5" class="px-5 py-6 text-center text-xs text-muted-foreground">
                    <template v-if="inactiveCredentials.length">
                      No active S3 credentials.
                      <button type="button" class="text-primary hover:underline" @click="showInactiveCredentials = true">Show inactive ({{ inactiveCredentials.length }})</button>
                    </template>
                    <template v-else>No S3 credentials for the authenticated user.</template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="revokeError" class="border-t border-border px-5 py-2 text-xs text-destructive">{{ revokeError }}</p>
          <CreateCredentialDialog v-model:open="createCredentialOpen" />
        </section>

        <section id="interop" class="surface scroll-mt-20 lg:scroll-mt-[4.5rem]">
          <header class="border-b border-border px-5 py-4">
            <div class="flex items-center gap-2"><Rss class="h-4 w-4 text-primary" /><h3 class="font-display text-sm font-semibold text-aruna-navy">Interoperability</h3></div>
            <p class="text-xs text-muted-foreground">Open protocols external services can consume from this node.</p>
          </header>
          <div class="space-y-3 p-5">
            <div>
              <div class="text-sm font-medium text-foreground">OAI-PMH data provider</div>
              <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
                Standard OAI-PMH 2.0 endpoint for metadata harvesters: publicly visible metadata documents are
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
              <Badge variant="outline" class="text-[10px] uppercase">Coming soon</Badge>
            </div>
          </div>
        </section>

        <section id="appearance" class="surface scroll-mt-20 lg:scroll-mt-[4.5rem]">
          <header class="flex items-center justify-between border-b border-border px-5 py-4"><div class="flex items-center gap-2"><Palette class="h-4 w-4 text-primary" /><h3 class="font-display text-sm font-semibold text-aruna-navy">Appearance</h3></div></header>
          <div class="grid gap-3 p-5 md:grid-cols-3">
            <button v-for="option in themeOptions" :key="option.id" class="flex items-center gap-3 rounded-lg border border-border bg-background/70 p-3 text-left transition-colors hover:border-primary/40" :class="appearance === option.id ? 'border-primary/60 ring-1 ring-primary/30' : ''" @click="setTheme(option.id)"><span class="grid h-12 w-16 shrink-0 place-items-center rounded-md border border-border shadow-inner" :style="{ background: option.preview }"><component :is="option.icon" class="h-4 w-4 text-primary" /></span><div><div class="text-sm font-medium text-foreground">{{ option.title }}</div></div></button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
