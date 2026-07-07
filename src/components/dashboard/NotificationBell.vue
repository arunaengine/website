<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { Bell, Check, ListChecks, Loader2 } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useNotifications } from '@/composables/useNotifications'
import { describeNotification, type NotificationDisplayContext } from '@/lib/notifications'
import type { ApiNotification } from '@/lib/api'
import { relativeTime } from '@/lib/utils'

const router = useRouter()
const { myGroups, discoverableGroups } = useAruna()
const {
  available,
  unreadCount,
  unreadDisplay,
  items,
  nextCursor,
  listLoading,
  loadingMore,
  listError,
  marking,
  fetchUnread,
  loadNotifications,
  loadMore,
  markRead,
  markAllRead,
} = useNotifications()

const open = ref(false)

const ctx: NotificationDisplayContext = {
  groupName: (id) =>
    myGroups.value.find((g) => g.id === id)?.name ??
    discoverableGroups.value.find((g) => g.id === id)?.name,
}

const rows = computed(() => items.value.map((n) => ({ n, display: describeNotification(n, ctx) })))
const hasUnread = computed(() => unreadCount.value > 0 || items.value.some((n) => !n.read))

function onOpenChange(value: boolean) {
  open.value = value
  if (value) {
    void loadNotifications()
    void fetchUnread()
  }
}

function timeOf(n: ApiNotification): string {
  return relativeTime(new Date(n.created_at_ms).toISOString())
}

// Row select: mark read (fire and forget) and follow the deep link.
function openNotification(n: ApiNotification) {
  void markRead([n.id])
  const { link } = describeNotification(n, ctx)
  open.value = false
  if (link) void router.push(link)
}

// Inline check button: mark read without navigating or closing the menu.
function markOnly(event: Event, n: ApiNotification) {
  event.preventDefault()
  event.stopPropagation()
  void markRead([n.id])
}

function onLoadMore(event: Event) {
  // preventDefault on radix select keeps the menu open.
  event.preventDefault()
  void loadMore()
}
</script>

<template>
  <DropdownMenu v-if="available" :open="open" @update:open="onOpenChange">
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="relative"
        :aria-label="unreadDisplay ? `Notifications (${unreadDisplay} unread)` : 'Notifications'"
      >
        <Bell class="h-4 w-4" />
        <span
          v-if="unreadDisplay"
          class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
          >{{ unreadDisplay }}</span
        >
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-96 max-w-[calc(100vw-2rem)] p-0">
      <div class="flex items-center justify-between border-b border-border px-3 py-2">
        <span class="text-sm font-medium">Notifications</span>
        <Button
          variant="ghost"
          size="sm"
          class="h-7 gap-1 text-xs"
          :disabled="!hasUnread || marking"
          @click="markAllRead"
        >
          <ListChecks class="h-3.5 w-3.5" /> Mark all read
        </Button>
      </div>
      <div class="max-h-[420px] overflow-y-auto">
        <!-- loading (first load only) -->
        <div v-if="listLoading && !items.length" class="space-y-2 p-3">
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
        </div>
        <!-- error -->
        <div v-else-if="listError" class="p-3">
          <ErrorPanel :message="listError" @retry="loadNotifications" />
        </div>
        <!-- empty -->
        <EmptyState
          v-else-if="!items.length"
          title="You're all caught up"
          description="Notifications about your groups and this realm will appear here."
        />
        <!-- rows -->
        <template v-else>
          <DropdownMenuItem
            v-for="{ n, display } in rows"
            :key="n.id"
            class="group items-start gap-3 border-b border-border/60 px-3 py-2.5 last:border-0"
            @select="openNotification(n)"
          >
            <component :is="display.icon" class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-2">
                <span
                  class="truncate text-sm"
                  :class="n.read ? 'text-muted-foreground' : 'font-medium text-foreground'"
                >
                  {{ display.title }}
                </span>
                <span class="shrink-0 text-[11px] text-muted-foreground">{{ timeOf(n) }}</span>
              </div>
              <div v-if="display.detail" class="truncate text-xs text-muted-foreground">{{ display.detail }}</div>
            </div>
            <span v-if="!n.read" class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            <!--
              Inline mark-as-read: kept always visible via opacity (not hidden/group-hover)
              so touch users can reach it, and given tabindex="-1" so it is not a *tabbable*
              interactive nested inside role=menuitem — the menu stays a single tab stop per
              WAI-ARIA menu semantics. Keyboard/SR users retain two equivalent paths: selecting
              the row marks it read then navigates, and "Mark all read" in the header is a real
              tab stop. Strict-axe fallback (if nested-interactive must be zero): delete this
              button outright. Resolves review 251 F7.
            -->
            <button
              v-if="!n.read"
              tabindex="-1"
              class="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-60 hover:text-foreground hover:opacity-100 group-hover:opacity-100"
              aria-label="Mark as read"
              @click="markOnly($event, n)"
            >
              <Check class="h-3.5 w-3.5" />
            </button>
          </DropdownMenuItem>
          <DropdownMenuItem
            v-if="nextCursor"
            class="justify-center py-2 text-xs text-muted-foreground"
            @select="onLoadMore"
          >
            <Loader2 v-if="loadingMore" class="h-3.5 w-3.5 animate-spin" />
            <span v-else>Load more</span>
          </DropdownMenuItem>
        </template>
      </div>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
