<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import RealmSwitcher from '@/components/layout/RealmSwitcher.vue'
import NewDatasetDialog from '@/components/metadata/NewDatasetDialog.vue'
import NotificationBell from '@/components/dashboard/NotificationBell.vue'
import { ChevronDown, Plus, Search, User, LogIn, LogOut, Key, Moon, Sun, RefreshCw, FileJson2, Users, UserRound } from '@lucide/vue'
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRealm } from '@/composables/useRealm'
import { useTheme } from '@/composables/useTheme'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useUnifiedSearch } from '@/composables/useUnifiedSearch'

const q = ref('')
const showResults = ref(false)
const showNewDataset = ref(false)
const { realm, role } = useRealm()
const { currentUser, metadata, groups, authError, loading } = useAruna()
const { hasSession, signIn, signOut, stage, authPending } = useAuth()
const { isDark, toggleTheme } = useTheme()
const route = useRoute()

// A token is stored but the API rejected it (expired/revoked session).
const sessionBroken = computed(() => hasSession.value && !currentUser.value && Boolean(authError.value))
const signingIn = computed(() => stage.value === 'redirecting')

function onSignIn() {
  void signIn({ redirectTo: route.fullPath })
}

async function handleSignOut() {
  await signOut()
  router.push({ name: 'landing' })
}
type QuickSection = 'datasets' | 'groups' | 'people'
interface QuickItem {
  key: string
  section: QuickSection
  title: string
  subtitle?: string
  routeName: string
  routeParams: Record<string, string>
}

const {
  documents: quickDocuments,
  groups: quickGroups,
  users: quickUsers,
  searched: quickSearched,
} = useUnifiedSearch(q, { limit: 5 })

// First paint: an instant filter over the already-loaded catalog and groups,
// shown until the server search answers (quickSearched flips true per query).
const instantItems = computed<QuickItem[]>(() => {
  const needle = q.value.trim().toLowerCase()
  if (!needle) return []
  const datasets = metadata.value
    .filter((doc) => `${doc.title} ${doc.description} ${doc.keywords.join(' ')}`.toLowerCase().includes(needle))
    .slice(0, 5)
    .map((doc): QuickItem => ({
      key: `d:${doc.ulid}`,
      section: 'datasets',
      title: doc.title,
      subtitle: doc.description || doc.ulid,
      routeName: 'metadata-detail',
      routeParams: { id: doc.ulid },
    }))
  const groupHits = groups.value
    .filter((group) => `${group.name} ${group.description}`.toLowerCase().includes(needle))
    .slice(0, 5)
    .map((group): QuickItem => ({
      key: `g:${group.id}`,
      section: 'groups',
      title: group.name,
      subtitle: group.description || group.id,
      routeName: 'groups',
      routeParams: { id: group.id },
    }))
  return [...datasets, ...groupHits]
})

const serverItems = computed<QuickItem[]>(() => [
  ...quickDocuments.value.map((hit): QuickItem => ({
    key: `d:${hit.document_id}`,
    section: 'datasets',
    title: hit.title || hit.document_path,
    subtitle: hit.snippet ?? undefined,
    routeName: 'metadata-detail',
    routeParams: { id: hit.document_id },
  })),
  ...quickGroups.value.map((group): QuickItem => ({
    key: `g:${group.group_id}`,
    section: 'groups',
    title: group.display_name,
    routeName: 'groups',
    routeParams: { id: group.group_id },
  })),
  ...quickUsers.value.map((user): QuickItem => ({
    key: `u:${user.user_id}`,
    section: 'people',
    title: user.name,
    routeName: 'user-profile',
    routeParams: { id: user.user_id },
  })),
])

const items = computed<QuickItem[]>(() => (quickSearched.value ? serverItems.value : instantItems.value))

const SECTION_META: Array<{ id: QuickSection; label: string }> = [
  { id: 'datasets', label: 'Datasets' },
  { id: 'groups', label: 'Groups' },
  { id: 'people', label: 'People' },
]
const sections = computed(() =>
  SECTION_META.map((meta) => ({ ...meta, items: items.value.filter((item) => item.section === meta.id) })).filter(
    (section) => section.items.length,
  ),
)

const activeIndex = ref(-1)
const activeKey = computed(() => items.value[activeIndex.value]?.key ?? null)
watch(items, () => (activeIndex.value = -1))
watch(q, () => (activeIndex.value = -1))

const router = useRouter()

function openItem(item: QuickItem) {
  showResults.value = false
  q.value = ''
  router.push({ name: item.routeName, params: item.routeParams })
}

function openSearchPage() {
  const term = q.value
  showResults.value = false
  q.value = ''
  router.push({ name: 'search', query: { q: term } })
}

function onKeydown(event: KeyboardEvent) {
  const list = items.value
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    showResults.value = true
    activeIndex.value = list.length ? (activeIndex.value + 1) % list.length : -1
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = list.length ? (activeIndex.value - 1 + list.length) % list.length : -1
  } else if (event.key === 'Enter') {
    const item = list[activeIndex.value]
    if (item) openItem(item)
    else if (q.value.trim()) openSearchPage()
  } else if (event.key === 'Escape') {
    showResults.value = false
  }
}

function scheduleHide() {
  window.setTimeout(() => (showResults.value = false), 120)
}
</script>

<template>
  <div class="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-xl">
    <div class="container flex h-14 items-center gap-3">
      <RealmSwitcher />

      <div class="relative min-w-0 max-w-xl flex-1">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          v-model="q"
          @focus="showResults = true"
          @blur="scheduleHide"
          @keydown="onKeydown"
          role="combobox"
          aria-controls="quick-search-results"
          :aria-expanded="showResults"
          class="h-9 w-full rounded-md border border-input bg-field pl-8 pr-16 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :placeholder="`Search ${realm.shortName}, datasets, groups and people…`"
        />
        <kbd
          class="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex"
        >
          ⌘K
        </kbd>

        <div
          v-if="showResults && (items.length || q)"
          id="quick-search-results"
          role="listbox"
          class="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-md border border-border bg-popover shadow-xl"
        >
          <div v-for="section in sections" :key="section.id">
            <div class="flex items-center gap-1.5 border-b border-border/70 bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <FileJson2 v-if="section.id === 'datasets'" class="h-3 w-3" />
              <Users v-else-if="section.id === 'groups'" class="h-3 w-3" />
              <UserRound v-else class="h-3 w-3" />
              {{ section.label }}
            </div>
            <button
              v-for="item in section.items"
              :key="item.key"
              role="option"
              :aria-selected="activeKey === item.key"
              @mousedown.prevent="openItem(item)"
              :class="[
                'flex w-full items-start gap-3 border-b border-border/70 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-muted',
                activeKey === item.key ? 'bg-muted' : '',
              ]"
            >
              <div class="flex-1 overflow-hidden">
                <div class="truncate font-medium text-foreground">{{ item.title }}</div>
                <div v-if="item.subtitle" class="truncate text-xs text-muted-foreground">{{ item.subtitle }}</div>
              </div>
            </button>
          </div>
          <button
            v-if="q"
            @mousedown.prevent="openSearchPage"
            class="flex w-full items-center gap-2 border-t border-border bg-muted/30 px-3 py-2.5 text-left text-xs font-medium text-primary hover:bg-muted"
          >
            See all results for "{{ q }}" in Search →
          </button>
        </div>
      </div>

      <Button
        v-if="currentUser"
        variant="outline"
        size="sm"
        class="hidden h-9 md:inline-flex"
        @click="showNewDataset = true"
      >
        <Plus class="h-4 w-4" /> New dataset
      </Button>

      <NotificationBell />

      <Button variant="ghost" size="icon" :aria-label="isDark ? 'Use light mode' : 'Use dark mode'" @click="toggleTheme">
        <Sun v-if="isDark" class="h-4 w-4" />
        <Moon v-else class="h-4 w-4" />
      </Button>

      <DropdownMenu v-if="currentUser">
        <DropdownMenuTrigger as-child>
          <button
            class="flex h-9 items-center gap-2 rounded-md border border-transparent px-1.5 text-sm hover:border-border hover:bg-muted"
          >
            <Avatar :user="currentUser" size="sm" class="ring-0" />
            <div class="hidden min-w-0 flex-col text-left leading-none sm:flex">
              <div class="truncate text-[13px] font-medium leading-none text-foreground">{{ currentUser.name }}</div>
              <div class="mt-0.5 truncate text-[11px] leading-none text-muted-foreground">
                {{ realm.shortName }} · {{ role.replace('realm-', '') }}
              </div>
            </div>
            <ChevronDown class="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-60">
          <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
          <div class="px-2 pb-2 text-sm">
            <div class="font-medium">{{ currentUser.name }}</div>
            <div class="truncate text-xs text-muted-foreground">{{ currentUser.email || currentUser.id }}</div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem @click="router.push({ name: 'settings', hash: '#profile' })"
            ><User class="h-3.5 w-3.5" /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem @click="router.push({ name: 'settings', hash: '#connection' })"
            ><Key class="h-3.5 w-3.5" /> Access tokens</DropdownMenuItem
          >
          <DropdownMenuSeparator />
          <DropdownMenuItem class="text-destructive focus:text-destructive" @click="handleSignOut"
            ><LogOut class="h-3.5 w-3.5" /> Sign out</DropdownMenuItem
          >
        </DropdownMenuContent>
      </DropdownMenu>

      <!-- Session restore in flight: an avatar-sized placeholder instead of
           flashing the Sign in button. -->
      <div v-else-if="authPending" class="flex h-9 items-center gap-2 px-1.5" aria-hidden="true">
        <Skeleton class="h-7 w-7 rounded-full" />
        <Skeleton class="hidden h-3 w-20 sm:block" />
      </div>

      <template v-else>
        <Button
          v-if="sessionBroken"
          variant="outline"
          size="sm"
          class="h-9 border-amber-500/50 text-amber-700 dark:text-amber-300"
          :title="authError ?? undefined"
          :disabled="signingIn"
          @click="onSignIn"
        >
          <RefreshCw class="h-3.5 w-3.5" /> Session expired - sign in again
        </Button>
        <Button v-else size="sm" class="h-9" :disabled="loading || signingIn" @click="onSignIn">
          <LogIn class="h-4 w-4" /> Sign in
        </Button>
      </template>
    </div>

    <NewDatasetDialog
      v-model:open="showNewDataset"
      @created="(d) => router.push({ name: 'metadata-detail', params: { id: d.ulid } })"
    />
  </div>
</template>
