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
import { ChevronDown, CircleCheck, CircleX, FileJson2, FolderPlus, LoaderCircle, MessageSquare, Play, Plus, TriangleAlert, Upload, User, Users, LogIn, LogOut, Key, Moon, Sun, RefreshCw } from '@lucide/vue'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useRealm } from '@/composables/useRealm'
import { useTheme } from '@/composables/useTheme'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { assistantAvailable, assistantUnread, assistantWarning } from '@/composables/assistantState'
import { statusTone } from '@/components/nodes/node-display'
import { homeRealmLabel } from '@/composables/useFederation'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { featureEnabled } from '@/lib/config'

// 'desktop' is the Aruna Desktop chrome: this computer's own node leads, before the group switcher.
const props = withDefaults(defineProps<{ variant?: 'portal' | 'desktop' }>(), { variant: 'portal' })

const { realm, role } = useRealm()
const { currentUser, authError, loading } = useAruna()
const { hasSession, requestSignIn, signOut, stage, authPending } = useAuth()
const { isDark, toggleTheme } = useTheme()
const { label: nodeLabel, state: nodeState, start: watchNode, stop: unwatchNode } = useDeviceStatus()
const route = useRoute()
const router = useRouter()
// An open bucket stays the upload target, with its folder and node.
function uploadFiles() {
  if (route.name === 'bucket') void router.push({ query: { ...route.query, addData: '1' } })
  else void router.push({ name: 'buckets', query: { addData: '1' } })
}

const desktop = computed(() => props.variant === 'desktop')
const { shown } = usePortalFeatures()
// New run starts a TES run, so it follows the same gates as the Compute entry.
const canRun = computed(() => featureEnabled('tes') && shown('compute'))
// A user of another realm shows that home realm next to the name.
const homeRealm = computed(() => (currentUser.value ? homeRealmLabel(currentUser.value.id, realm.value.id) : null))

// A token is stored but the API rejected it (expired/revoked session).
const sessionBroken = computed(() => hasSession.value && !currentUser.value && Boolean(authError.value))
const signingIn = computed(() => stage.value === 'redirecting')

// A device that is still coming up is in progress, not merely unknown.
const nodeTone = computed(() =>
  nodeState.value === 'starting' ? ('progress' as const) : statusTone(nodeState.value),
)

const nodeMark = computed(() => {
  if (nodeTone.value === 'done') return { icon: CircleCheck, color: 'text-status-ok' }
  if (nodeTone.value === 'progress') return { icon: LoaderCircle, color: 'text-status-running motion-safe:animate-spin' }
  if (nodeTone.value === 'failed') return { icon: CircleX, color: 'text-status-failed' }
  return { icon: TriangleAlert, color: 'text-status-warn' }
})

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
  void requestSignIn({ redirectTo: route.fullPath })
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
    <div class="w-full px-4 sm:px-6 flex h-14 items-center gap-1 min-[480px]:gap-3">
      <!-- The device plate: this computer's node. The switcher after it shows the realm. -->
      <RouterLink
        v-if="desktop"
        :to="{ name: 'device' }"
        class="flex h-9 min-w-0 shrink items-center gap-2 rounded-md border border-border/70 bg-card px-2.5 transition-colors hover:border-border hover:bg-muted"
        :title="`This computer: ${nodeLabel}`"
      >
        <!-- A state icon, never a dot before the label: a check when fine. -->
        <component :is="nodeMark.icon" class="size-3.5 shrink-0" :class="nodeMark.color" :data-tone="nodeTone" aria-hidden="true" />
        <span class="text-xs font-medium leading-none text-foreground">{{ nodeLabel }}</span>
      </RouterLink>
      <ContextSwitcher />

      <SearchOverlay />

      <!-- Offered once a provider is configured; a warning dot says none can answer. -->
      <Button
        v-if="assistantAvailable || assistantWarning"
        data-tour="top-assistant"
        variant="ghost"
        size="icon"
        class="relative shrink-0"
        :aria-label="assistantWarning
          ? `Open the assistant. ${assistantWarning}`
          : assistantUnread ? `Open the assistant, ${assistantUnread} background ${assistantUnread === 1 ? 'update' : 'updates'}` : 'Open the assistant'"
        :title="assistantWarning || 'Assistant'"
        @click="openAssistant"
      >
        <MessageSquare class="h-4 w-4" />
        <StatusDot
          v-if="assistantWarning"
          tone="attention"
          :label="assistantWarning"
          class="absolute right-1.5 top-1.5 size-2 ring-2 ring-background"
        />
        <span
          v-else-if="assistantUnread"
          class="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background"
        />
      </Button>

      <DropdownMenu v-if="currentUser">
        <DropdownMenuTrigger as-child>
          <Button
            data-tour="top-create-dataset"
            variant="outline"
            size="sm"
            class="h-9 shrink-0 max-sm:w-9 max-sm:px-0"
            aria-label="Add"
            title="Add"
          >
            <Plus class="h-4 w-4" /><span class="hidden sm:inline">Add</span><ChevronDown class="hidden h-3.5 w-3.5 sm:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-56">
          <DropdownMenuItem @click="uploadFiles"><Upload class="h-3.5 w-3.5" /> Upload files</DropdownMenuItem>
          <DropdownMenuItem @click="router.push({ name: 'buckets', query: { create: 'bucket' } })"><FolderPlus class="h-3.5 w-3.5" /> New bucket</DropdownMenuItem>
          <DropdownMenuItem v-if="canRun" @click="router.push({ name: 'compute-new' })"><Play class="h-3.5 w-3.5" /> New run</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem @click="router.push({ name: 'dataset-new' })"><FileJson2 class="h-3.5 w-3.5" /> Create dataset</DropdownMenuItem>
          <DropdownMenuItem @click="router.push({ name: 'groups', query: { create: 'group' } })"><Users class="h-3.5 w-3.5" /> Create group</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
            <div class="hidden min-w-0 max-w-40 flex-col text-left leading-none xl:flex">
              <div class="truncate text-[13px] font-medium leading-none text-foreground">{{ currentUser.name }}</div>
              <div class="mt-0.5 truncate text-xs leading-none text-muted-foreground">
                {{ homeRealm ?? `${realm.shortName}, ${role.replace('realm-', '')}` }}
              </div>
            </div>
            <ChevronDown class="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground xl:block" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-60">
          <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
          <div class="px-2 pb-2 text-sm">
            <div class="font-medium">{{ currentUser.name }}<span v-if="homeRealm" class="font-normal text-muted-foreground"> ({{ homeRealm }})</span></div>
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
