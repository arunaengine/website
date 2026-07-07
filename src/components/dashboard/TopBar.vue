<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Avatar from '@/components/ui/Avatar.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import RealmSwitcher from '@/components/layout/RealmSwitcher.vue'
import NewDatasetDialog from '@/components/metadata/NewDatasetDialog.vue'
import NotificationBell from '@/components/dashboard/NotificationBell.vue'
import { ChevronDown, Plus, Search, User, LogIn, LogOut, Key, Moon, Sun, RefreshCw } from '@lucide/vue'
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRealm } from '@/composables/useRealm'
import { useTheme } from '@/composables/useTheme'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'

const q = ref('')
const showResults = ref(false)
const showNewDataset = ref(false)
const { realm, role } = useRealm()
const { currentUser, metadata, groups, authError, loading } = useAruna()
const { hasSession, signIn, signOut, stage } = useAuth()
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
const results = computed(() => {
  const needle = q.value.trim().toLowerCase()
  if (!needle) return []
  return [
    ...metadata.value
      .filter((doc) => `${doc.title} ${doc.description} ${doc.keywords.join(' ')}`.toLowerCase().includes(needle))
      .map((doc) => ({
        id: doc.ulid,
        badge: 'metadata',
        title: doc.title,
        subtitle: doc.description || doc.ulid,
        routeName: 'metadata-detail',
        routeParams: { id: doc.ulid },
      })),
    ...groups.value
      .filter((group) => `${group.name} ${group.description}`.toLowerCase().includes(needle))
      .map((group) => ({
        id: group.id,
        badge: 'group',
        title: group.name,
        subtitle: group.description || group.id,
        routeName: 'groups',
        routeParams: { id: group.id },
      })),
  ].slice(0, 8)
})
const router = useRouter()

function openResult(r: { routeName: string; routeParams: Record<string, string> }) {
  showResults.value = false
  q.value = ''
  router.push({ name: r.routeName, params: r.routeParams })
}

function openSearchPage() {
  const term = q.value
  showResults.value = false
  q.value = ''
  router.push({ name: 'search', query: { q: term } })
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
          class="h-9 w-full rounded-md border border-input bg-field pl-8 pr-16 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :placeholder="`Search in ${realm.shortName} — metadata and groups…`"
        />
        <kbd
          class="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex"
        >
          ⌘K
        </kbd>

        <div
          v-if="showResults && (results.length || q)"
          class="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-md border border-border bg-popover shadow-xl"
        >
          <button
            v-for="r in results"
            :key="r.id"
            @mousedown.prevent="openResult(r)"
            class="flex w-full items-start gap-3 border-b border-border/70 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-muted"
          >
            <Badge variant="secondary" class="shrink-0">{{ r.badge }}</Badge>
            <div class="flex-1 overflow-hidden">
              <div class="truncate font-medium text-foreground">{{ r.title }}</div>
              <div class="truncate text-xs text-muted-foreground">{{ r.subtitle }}</div>
            </div>
          </button>
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
          <RefreshCw class="h-3.5 w-3.5" /> Session expired — sign in again
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
