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
import SearchOverlay from '@/components/dashboard/SearchOverlay.vue'
import { ChevronDown, Plus, User, LogIn, LogOut, Key, Moon, Sun, RefreshCw } from '@lucide/vue'
import { ref, computed, onMounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useRealm } from '@/composables/useRealm'
import { useTheme } from '@/composables/useTheme'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useDeviceStatus } from '@/composables/useDeviceStatus'

// 'desktop' is the Aruna Desktop chrome: no realm switcher and no dataset
// shortcut, and the machine's own node takes the leading slot instead.
const props = withDefaults(defineProps<{ variant?: 'portal' | 'desktop' }>(), { variant: 'portal' })

const showNewDataset = ref(false)
const { realm, role } = useRealm()
const { currentUser, authError, loading } = useAruna()
const { hasSession, signIn, signOut, stage, authPending } = useAuth()
const { isDark, toggleTheme } = useTheme()
const { label: nodeLabel, state: nodeState, start: watchNode } = useDeviceStatus()
const route = useRoute()
const router = useRouter()

const desktop = computed(() => props.variant === 'desktop')

// A token is stored but the API rejected it (expired/revoked session).
const sessionBroken = computed(() => hasSession.value && !currentUser.value && Boolean(authError.value))
const signingIn = computed(() => stage.value === 'redirecting')

const NODE_DOT: Record<string, string> = {
  running: 'bg-emerald-500',
  starting: 'bg-sky-500 animate-pulse',
  stopped: 'bg-muted-foreground/60',
  error: 'bg-destructive',
  unknown: 'bg-muted-foreground/40',
}
const nodeDot = computed(() => NODE_DOT[nodeState.value] ?? NODE_DOT.unknown)

onMounted(() => {
  if (desktop.value) watchNode()
})

function onSignIn() {
  void signIn({ redirectTo: route.fullPath })
}

// Signing out of the shell lands on its own sign-in step; there is no landing
// page behind it.
async function handleSignOut() {
  await signOut()
  router.push({ name: desktop.value ? 'welcome-sign-in' : 'landing' })
}
</script>

<template>
  <div class="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-xl">
    <div class="container flex h-14 items-center gap-1 min-[480px]:gap-3">
      <!-- The machine plate: this device's node, and the realm it answers to. -->
      <RouterLink
        v-if="desktop"
        :to="{ name: 'device' }"
        class="flex h-9 min-w-0 shrink items-center gap-2 rounded-md border border-border/70 bg-card px-2.5 transition-colors hover:border-border hover:bg-muted"
        :title="`This device: ${nodeLabel}`"
      >
        <span :class="['h-1.5 w-1.5 shrink-0 rounded-full', nodeDot]" aria-hidden="true" />
        <span class="text-[12px] font-medium leading-none text-foreground">{{ nodeLabel }}</span>
        <span class="hidden h-3 w-px shrink-0 bg-border sm:block" aria-hidden="true" />
        <span class="hidden max-w-32 truncate text-[12px] leading-none text-muted-foreground sm:block">{{
          realm.shortName
        }}</span>
      </RouterLink>
      <RealmSwitcher v-else class="max-w-36 min-[480px]:max-w-none" />

      <SearchOverlay />

      <Button
        v-if="currentUser && !desktop"
        variant="outline"
        size="sm"
        class="hidden h-9 md:inline-flex"
        @click="showNewDataset = true"
      >
        <Plus class="h-4 w-4" /> Create dataset
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
          aria-label="Session expired, sign in again"
          :title="authError ?? undefined"
          :disabled="signingIn"
          @click="onSignIn"
        >
          <RefreshCw class="h-3.5 w-3.5" />
          <span class="hidden min-[480px]:inline">Session expired - sign in again</span>
        </Button>
        <Button
          v-else
          size="sm"
          class="h-9"
          aria-label="Sign in"
          :disabled="loading || signingIn"
          @click="onSignIn"
        >
          <LogIn class="h-4 w-4" /> <span class="hidden min-[480px]:inline">Sign in</span>
        </Button>
      </template>
    </div>

    <NewDatasetDialog
      v-model:open="showNewDataset"
      @created="(d) => router.push({ name: 'metadata-detail', params: { id: d.ulid } })"
    />
  </div>
</template>
