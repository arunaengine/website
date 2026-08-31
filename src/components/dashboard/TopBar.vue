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
import ContextSwitcher from '@/components/layout/ContextSwitcher.vue'
import NotificationBell from '@/components/dashboard/NotificationBell.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import SearchOverlay from '@/components/dashboard/SearchOverlay.vue'
import { ChevronDown, Sparkles, Plus, User, LogIn, LogOut, Key, Moon, Sun, RefreshCw } from '@lucide/vue'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useRealm } from '@/composables/useRealm'
import { useTheme } from '@/composables/useTheme'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { assistantAvailable } from '@/composables/assistantState'
import { statusTone } from '@/components/nodes/node-display'

// 'desktop' is the Aruna Desktop chrome: no realm switcher and no dataset
// shortcut, and this computer's own node takes the leading slot instead.
const props = withDefaults(defineProps<{ variant?: 'portal' | 'desktop' }>(), { variant: 'portal' })

const { realm, role } = useRealm()
const { currentUser, authError, loading } = useAruna()
const { hasSession, signIn, signOut, stage, authPending } = useAuth()
const { isDark, toggleTheme } = useTheme()
const { label: nodeLabel, state: nodeState, start: watchNode, stop: unwatchNode } = useDeviceStatus()
const route = useRoute()
const router = useRouter()

const desktop = computed(() => props.variant === 'desktop')

// A token is stored but the API rejected it (expired/revoked session).
const sessionBroken = computed(() => hasSession.value && !currentUser.value && Boolean(authError.value))
const signingIn = computed(() => stage.value === 'redirecting')

// A device that is still coming up is in progress, not merely unknown.
const nodeTone = computed(() =>
  nodeState.value === 'starting' ? ('progress' as const) : statusTone(nodeState.value),
)

function ensureProviders() {
  void import('@/composables/useAssistantChat').then(({ useAssistantChat }) => useAssistantChat().ensureProviders())
}

function openAssistant() {
  void import('@/composables/useAssistantChat').then(({ useAssistantChat }) => useAssistantChat().openPanel())
}

onMounted(() => {
  if (desktop.value) watchNode()
  if (currentUser.value) ensureProviders()
})
watch(currentUser, (user) => {
  if (user) ensureProviders()
})
onUnmounted(() => {
  if (desktop.value) unwatchNode()
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
      <!-- The device plate: this computer's node, and the realm it answers to. -->
      <RouterLink
        v-if="desktop"
        :to="{ name: 'device' }"
        class="flex h-9 min-w-0 shrink items-center gap-2 rounded-md border border-border/70 bg-card px-2.5 transition-colors hover:border-border hover:bg-muted"
        :title="`This device: ${nodeLabel}`"
      >
        <StatusDot :tone="nodeTone" :label="nodeLabel" class="size-1.5" />
        <span class="text-[12px] font-medium leading-none text-foreground">{{ nodeLabel }}</span>
        <span class="hidden h-3 w-px shrink-0 bg-border sm:block" aria-hidden="true" />
        <span class="hidden max-w-32 truncate text-[12px] leading-none text-muted-foreground sm:block">{{
          realm.shortName
        }}</span>
      </RouterLink>
      <ContextSwitcher v-else />

      <SearchOverlay />

      <!-- Only offered once a provider is configured and ready. -->
      <Button
        v-if="assistantAvailable"
        data-tour="top-assistant"
        variant="ghost"
        size="icon"
        class="shrink-0"
        aria-label="Open the assistant"
        title="Assistant"
        @click="openAssistant"
      >
        <Sparkles class="h-4 w-4 text-primary" />
      </Button>

      <Button
        v-if="currentUser && !desktop"
        data-tour="top-create-dataset"
        variant="outline"
        size="sm"
        class="hidden h-9 shrink-0 md:inline-flex"
        aria-label="Create dataset"
        title="Create dataset"
        @click="router.push({ name: 'dataset-new' })"
      >
        <Plus class="h-4 w-4" /><span class="hidden lg:inline">Create dataset</span>
      </Button>

      <NotificationBell />

      <Button
        variant="ghost"
        size="icon"
        class="shrink-0"
        :aria-label="isDark ? 'Use light mode' : 'Use dark mode'"
        @click="toggleTheme"
      >
        <Sun v-if="isDark" class="h-4 w-4" />
        <Moon v-else class="h-4 w-4" />
      </Button>

      <DropdownMenu v-if="currentUser">
        <DropdownMenuTrigger as-child>
          <button
            data-tour="top-account"
            class="flex h-9 items-center gap-2 rounded-md border border-transparent px-1.5 text-sm hover:border-border hover:bg-muted"
          >
            <Avatar :user="currentUser" size="sm" class="ring-0" />
            <div class="hidden min-w-0 max-w-40 flex-col text-left leading-none sm:flex">
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
          <DropdownMenuItem @click="router.push({ name: 'settings' })"
            ><User class="h-3.5 w-3.5" /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem @click="router.push({ name: 'settings', query: { tab: 'connection' } })"
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

  </div>
</template>
