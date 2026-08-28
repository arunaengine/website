<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Input from '@/components/ui/Input.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import CopyButton from '@/components/nodes/CopyButton.vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useRefresh } from '@/composables/useRefresh'
import { useUserDirectory } from '@/composables/useUserDirectory'
import { truncateMiddle } from '@/lib/utils'
import { ApiError, type ApiUser } from '@/lib/api'
import { useDebounceFn } from '@vueuse/core'
import { ChevronLeft, ChevronRight, ShieldCheck, Users, UserSearch } from '@lucide/vue'

const { bootstrapped, currentUser, canInspectUsers, apiGroups, listUsers, getUser, searchUsers } = useAruna()
const { isAuthenticated } = useAuth()
// Shared realm user cache; search hydration reuses it instead of a second one.
const { resolveUser } = useUserDirectory()

const ready = computed(() => bootstrapped.value && !!currentUser.value && canInspectUsers.value)

function errorMessage(err: unknown): string {
  return err instanceof ApiError || err instanceof Error ? err.message : String(err)
}

// Search hits carry only id + name; rows from GET /users are complete.
interface UserRow {
  user: ApiUser
  hydrated: boolean
}

// ── Directory paging (cursor-based: start_after from GET /users) ────────────
const PAGE_SIZE = 25

// cursors[i] is the exclusive start_after for page i; page 0 starts unset.
const cursors = ref<Array<string | undefined>>([undefined])
const pageIndex = ref(0)
const listRows = ref<UserRow[]>([])
const nextCursor = ref<string | null>(null)
const listLoading = ref(false)
const listError = ref<string | null>(null)

let listSeq = 0
async function loadPage(index: number) {
  const seq = ++listSeq
  listLoading.value = true
  listError.value = null
  try {
    const response = await listUsers({ limit: PAGE_SIZE, startAfter: cursors.value[index] })
    if (seq !== listSeq) return
    listRows.value = response.users.map((user) => ({ user, hydrated: true }))
    nextCursor.value = response.next_start_after ?? null
    pageIndex.value = index
  } catch (err) {
    if (seq === listSeq) listError.value = errorMessage(err)
  } finally {
    if (seq === listSeq) listLoading.value = false
  }
}

function nextPage() {
  if (!nextCursor.value || listLoading.value) return
  cursors.value = [...cursors.value.slice(0, pageIndex.value + 1), nextCursor.value]
  void loadPage(pageIndex.value + 1)
}
function prevPage() {
  if (pageIndex.value > 0 && !listLoading.value) void loadPage(pageIndex.value - 1)
}

// ── Search (GET /users/search, min 2 chars, backend caps limit at 20) ───────
const query = ref('')
const searching = computed(() => query.value.trim().length >= 2)
const searchRows = ref<UserRow[]>([])
const searchLoading = ref(false)
const searchError = ref<string | null>(null)
const searchTruncated = ref(false)

let searchSeq = 0
async function runSearch(term: string) {
  const seq = ++searchSeq
  searchLoading.value = true
  searchError.value = null
  try {
    const response = await searchUsers(term)
    if (seq !== searchSeq) return
    searchTruncated.value = !!response.next_start_after
    // Hydrate hits via GET /users/{id} so both modes render the same columns;
    // a failed hydration degrades to a name-only row instead of vanishing.
    const rows = await Promise.all(
      response.users.map(async (hit): Promise<UserRow> => {
        const user = await resolveUser(hit.user_id)
        if (user) return { user, hydrated: true }
        return { user: { user_id: hit.user_id, name: hit.name, subject_ids: [], attributes: {} }, hydrated: false }
      }),
    )
    if (seq !== searchSeq) return
    searchRows.value = rows
  } catch (err) {
    if (seq === searchSeq) {
      searchError.value = errorMessage(err)
      searchRows.value = []
    }
  } finally {
    if (seq === searchSeq) searchLoading.value = false
  }
}

const debouncedSearch = useDebounceFn((term: string) => void runSearch(term), 250)
watch(query, (value) => {
  const term = value.trim()
  if (term.length < 2) {
    searchSeq++
    searchRows.value = []
    searchLoading.value = false
    searchError.value = null
    searchTruncated.value = false
    return
  }
  void debouncedSearch(term)
})

const visibleRows = computed(() => (searching.value ? searchRows.value : listRows.value))
const activeLoading = computed(() => (searching.value ? searchLoading.value : listLoading.value))
const activeError = computed(() => (searching.value ? searchError.value : listError.value))

function reload(): Promise<void> {
  return searching.value ? runSearch(query.value.trim()) : loadPage(pageIndex.value)
}

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(reload)
const spinning = computed(() => refreshBusy.value || activeLoading.value)

// Load once the permission gate opens; never before, so the forbidden and
// signed-out states stay HTTP-free.
let loaded = false
watch(
  ready,
  (ok) => {
    if (ok && !loaded) {
      loaded = true
      void loadPage(0)
    }
  },
  { immediate: true },
)

function attributeKeys(user: ApiUser): string[] {
  return Object.keys(user.attributes).sort()
}

// ── Detail dialog (centered modal; side sheets are banned in this app) ───────
const detailOpen = ref(false)
const selected = ref<ApiUser | null>(null)
const detail = ref<ApiUser | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)

let detailSeq = 0
async function loadDetail(userId: string) {
  const seq = ++detailSeq
  detailLoading.value = true
  detailError.value = null
  try {
    const fresh = await getUser(userId)
    if (seq === detailSeq) detail.value = fresh
  } catch (err) {
    if (seq === detailSeq) detailError.value = errorMessage(err)
  } finally {
    if (seq === detailSeq) detailLoading.value = false
  }
}

function inspect(row: UserRow) {
  selected.value = row.user
  detail.value = row.hydrated ? row.user : null
  detailOpen.value = true
  void loadDetail(row.user.user_id)
}

// Hide attributes whose value is empty or unset so they do not render as blank rows.
const detailAttributes = computed(() =>
  Object.entries(detail.value?.attributes ?? {})
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .sort(([a], [b]) => a.localeCompare(b)),
)

// Member lists are only served for groups the caller belongs to (backend
// map_roles_with_visibility), so this join covers exactly the groups the
// admin shares with the inspected user, never the user's full memberships.
const sharedGroups = computed(() => {
  const userId = selected.value?.user_id
  if (!userId) return []
  return apiGroups.value
    .map((group) => ({
      groupId: group.group_id,
      name: group.display_name,
      roles: (group.roles ?? [])
        .filter((role) => role.assigned_users?.includes(userId))
        .map((role) => role.name),
    }))
    .filter((entry) => entry.roles.length > 0)
})
</script>

<template>
  <div>
    <PageHeader title="Realm users" description="Read-only directory of every user registered in this realm.">
      <template #actions>
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: 'admin' }">Admin</RouterLink>
        </Button>
        <RefreshButton :busy="spinning" :disabled="!ready" @click="onRefresh" />
      </template>
    </PageHeader>

    <div v-if="!bootstrapped" class="container space-y-3 py-8">
      <Skeleton class="h-24" />
      <Skeleton class="h-64" />
    </div>

    <div v-else-if="!ready" class="container py-8">
      <section class="surface mx-auto max-w-xl p-8 text-center">
        <ShieldCheck class="mx-auto h-8 w-8 text-muted-foreground/70" />
        <h2 class="mt-3 font-display text-base font-semibold text-aruna-navy">Realm admin access required</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">
          {{
            isAuthenticated
              ? 'Your account does not hold the user-directory permission (READ on /{realm}/admin/u) needed to inspect realm users.'
              : 'Sign in with a realm admin account to inspect realm users.'
          }}
        </p>
      </section>
    </div>

    <div v-else class="container py-8">
      <section class="surface">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div class="flex items-center gap-2">
            <Users class="h-4 w-4 text-primary" />
            <h3 class="font-display text-sm font-semibold text-aruna-navy">Users</h3>
          </div>
          <div class="w-full sm:max-w-xs">
            <label for="user-directory-search" class="sr-only">Search users by name or email</label>
            <Input
              id="user-directory-search"
              v-model="query"
              type="datasets"
              placeholder="Search by name or email (min 2 characters)"
            />
          </div>
        </header>

        <div v-if="activeLoading && !visibleRows.length" class="space-y-2 p-5" aria-hidden="true">
          <Skeleton v-for="i in 5" :key="i" class="h-10" />
        </div>

        <div v-else-if="activeError" class="p-5">
          <ErrorPanel :message="activeError" @retry="reload" />
        </div>

        <EmptyState
          v-else-if="!visibleRows.length && searching"
          title="No matching users"
          :description="`No user name or email contains “${query.trim()}”.`"
        >
          <template #icon><UserSearch class="h-8 w-8" /></template>
        </EmptyState>

        <EmptyState
          v-else-if="!visibleRows.length"
          title="No users registered"
          description="Users appear here after their first sign-in through one of the realm's OIDC providers."
        >
          <template #icon><Users class="h-8 w-8" /></template>
        </EmptyState>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <caption class="sr-only">Realm users</caption>
            <thead>
              <tr class="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th scope="col" class="px-5 py-2.5 font-medium">Name</th>
                <th scope="col" class="px-5 py-2.5 font-medium">Subjects</th>
                <th scope="col" class="px-5 py-2.5 font-medium">Attributes</th>
                <th scope="col" class="px-5 py-2.5 text-right font-medium"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in visibleRows"
                :key="row.user.user_id"
                class="border-b border-border/60 last:border-b-0 hover:bg-muted/40"
              >
                <td class="px-5 py-3">
                  <div class="font-medium text-foreground">{{ row.user.name || '-' }}</div>
                  <div class="font-mono text-[10px] text-muted-foreground">{{ truncateMiddle(row.user.user_id, 10, 6) }}</div>
                </td>
                <td class="px-5 py-3 tabular-nums text-muted-foreground">
                  {{ row.hydrated ? row.user.subject_ids.length : '-' }}
                </td>
                <td class="px-5 py-3">
                  <span v-if="!row.hydrated" class="text-muted-foreground">-</span>
                  <span v-else-if="!attributeKeys(row.user).length" class="text-muted-foreground">none</span>
                  <span v-else class="flex flex-wrap items-center gap-1">
                    <Badge v-for="key in attributeKeys(row.user).slice(0, 3)" :key="key" variant="outline" class="font-mono">
                      {{ key }}
                    </Badge>
                    <span v-if="attributeKeys(row.user).length > 3" class="text-[11px] text-muted-foreground">
                      +{{ attributeKeys(row.user).length - 3 }}
                    </span>
                  </span>
                </td>
                <td class="px-5 py-3 text-right">
                  <Button variant="ghost" size="sm" :aria-label="`Inspect ${row.user.name || row.user.user_id}`" @click="inspect(row)">
                    Inspect
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer
          v-if="!activeError && !searching && (pageIndex > 0 || nextCursor)"
          class="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-2 text-[11px] text-muted-foreground"
        >
          <span aria-live="polite">Page {{ pageIndex + 1 }} · {{ listRows.length }} users shown</span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded-md border border-border bg-background text-foreground/70 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="pageIndex <= 0 || listLoading"
              aria-label="Previous page"
              @click="prevPage"
            >
              <ChevronLeft class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded-md border border-border bg-background text-foreground/70 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!nextCursor || listLoading"
              aria-label="Next page"
              @click="nextPage"
            >
              <ChevronRight class="h-3.5 w-3.5" />
            </button>
          </div>
        </footer>
        <footer
          v-else-if="!activeError && searching && searchTruncated"
          class="border-t border-border bg-muted/20 px-5 py-2 text-[11px] text-muted-foreground"
        >
          Only the first {{ searchRows.length }} matches are shown, refine the search to narrow it down.
        </footer>
      </section>
    </div>

    <Dialog :open="detailOpen" @update:open="(v: boolean) => (detailOpen = v)">
      <DialogContent class="flex max-h-[85vh] w-[92vw] max-w-2xl flex-col gap-0 overflow-hidden bg-background p-0">
        <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-6">
          <DialogTitle class="sr-only">User details</DialogTitle>

        <div v-if="detailLoading && !detail" class="space-y-4">
          <Skeleton class="h-8 w-2/3" />
          <Skeleton class="h-28" />
          <Skeleton class="h-28" />
        </div>

        <ErrorPanel
          v-else-if="detailError && !detail"
          :message="detailError"
          @retry="selected && loadDetail(selected.user_id)"
        />

        <div v-else-if="detail" class="space-y-6">
          <div class="space-y-1.5 pr-8">
            <h2 class="font-display text-lg font-semibold text-aruna-navy">{{ detail.name || 'Unnamed user' }}</h2>
            <div class="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <span class="truncate">{{ detail.user_id }}</span>
              <CopyButton :value="detail.user_id" label="Copy user id" />
            </div>
            <p v-if="detailError" class="text-[11px] text-amber-700 dark:text-amber-300">
              Refresh failed ({{ detailError }}), showing the last loaded state.
            </p>
          </div>

          <section class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identity subjects</h3>
            <p v-if="!detail.subject_ids.length" class="text-xs text-muted-foreground">No linked identity subjects.</p>
            <ul v-else class="space-y-1">
              <li
                v-for="subject in detail.subject_ids"
                :key="subject"
                class="flex items-center gap-1.5 rounded-md bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-foreground"
              >
                <span class="min-w-0 break-all">{{ subject }}</span>
                <CopyButton :value="subject" label="Copy subject id" />
              </li>
            </ul>
          </section>

          <section class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attributes</h3>
            <p v-if="!detailAttributes.length" class="text-xs text-muted-foreground">No attributes set.</p>
            <dl v-else class="grid grid-cols-[minmax(8rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
              <template v-for="[key, value] in detailAttributes" :key="key">
                <dt class="break-all font-mono text-muted-foreground">{{ key }}</dt>
                <dd class="break-all text-foreground">{{ value }}</dd>
              </template>
            </dl>
          </section>

          <section class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shared groups</h3>
            <p v-if="!sharedGroups.length" class="text-xs text-muted-foreground">
              You share no groups with this user.
            </p>
            <ul v-else class="space-y-1.5">
              <li v-for="entry in sharedGroups" :key="entry.groupId" class="flex flex-wrap items-center gap-1.5 text-xs">
                <RouterLink class="font-medium text-primary hover:underline" :to="{ name: 'group', params: { id: entry.groupId } }">
                  {{ entry.name || truncateMiddle(entry.groupId) }}
                </RouterLink>
                <Badge v-for="role in entry.roles" :key="role" variant="secondary">{{ role }}</Badge>
              </li>
            </ul>
            <p class="text-[11px] text-muted-foreground">
              Group member lists are only visible to their members, so this shows the groups you share with this
              user, not their full memberships.
            </p>
          </section>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
