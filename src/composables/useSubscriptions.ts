import { computed, ref, watch } from 'vue'
import {
  ApiError,
  apiRequest,
  type CreateSubscriptionRequest,
  type GroupSubscription,
  type ListSubscriptionsResponse,
} from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import { useAruna } from '@/composables/useAruna'

// Group subscriptions / offline leases (aruna#273). The backend does not serve
// these endpoints yet; every path here is gated behind the `subscriptions`
// feature flag, so with the default config (features: {}) this module is inert
// — no HTTP call can fire because every loader/mutation starts with
// assertEnabled().

const subscriptions = ref<GroupSubscription[]>([])
const subscriptionsLoaded = ref(false)
const subscriptionsError = ref<string | null>(null)
const busy = ref(false)
const unsubscribingIds = ref<string[]>([])

// Reset on account change (mirrors useJoinRequests/useNotifications): a manual
// token swap changes currentUser without a reload, and the module-singleton
// cache would otherwise render the previous account's leases. Reset only — no
// HTTP, no featureEnabled read — so the flag-off zero-HTTP guarantee holds.
if (typeof window !== 'undefined') {
  const { currentUser } = useAruna()
  watch(
    () => currentUser.value?.id,
    (id, prev) => {
      if (id === prev) return
      subscriptions.value = []
      subscriptionsLoaded.value = false
      subscriptionsError.value = null
    },
  )
}

const subscriptionsEnabled = computed(() => featureEnabled('subscriptions'))
const subscribedGroupIds = computed(() => new Set(subscriptions.value.map((s) => s.group_id)))

function assertEnabled() {
  if (!featureEnabled('subscriptions')) {
    throw new Error(
      'Subscriptions are not enabled on this portal (portal-config features.subscriptions)',
    )
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Sibling composable to useAruna: reuse its apiBaseUrl/authToken refs to build
// the same client, exactly like useJoinRequests.
function request<T>(path: string, options = {}) {
  const { apiBaseUrl, authToken } = useAruna()
  return apiRequest<T>(path, options, { baseUrl: apiBaseUrl.value, token: authToken.value })
}

// GET /users/subscriptions — leases held by the node serving this portal.
// not yet provided by the backend (aruna#273). A missing backend must degrade
// to an inline notice, so this catches and stores the error rather than throwing.
async function loadSubscriptions(): Promise<void> {
  assertEnabled()
  subscriptionsError.value = null
  try {
    const response = await request<ListSubscriptionsResponse>('/users/subscriptions')
    subscriptions.value = [...response.subscriptions].sort((a, b) => b.created_at_ms - a.created_at_ms)
    subscriptionsLoaded.value = true
  } catch (err) {
    subscriptionsError.value = errorMessage(err)
  }
}

// Idempotent mount hook: load once, skip when already loaded or signed out.
async function ensureSubscriptionsLoaded(): Promise<void> {
  if (!featureEnabled('subscriptions')) return
  const { authToken } = useAruna()
  if (subscriptionsLoaded.value || !authToken.value) return
  await loadSubscriptions()
}

// POST /users/subscriptions — not yet provided by the backend (aruna#273).
// 201 GroupSubscription; 409 already subscribed; 403 group not readable;
// 404/501 on nodes that cannot hold leases. Throws ApiError upward so the view
// renders the message verbatim.
async function subscribe(groupId: string): Promise<GroupSubscription> {
  assertEnabled()
  busy.value = true
  try {
    const body: CreateSubscriptionRequest = { group_id: groupId }
    const created = await request<GroupSubscription>('/users/subscriptions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    subscriptions.value = [created, ...subscriptions.value.filter((s) => s.group_id !== groupId)]
    // Reconcile with the server view (sync state/progress) without blocking the
    // caller on it.
    void loadSubscriptions().catch(() => undefined)
    return created
  } finally {
    busy.value = false
  }
}

// DELETE /users/subscriptions/{group_id} — not yet provided by the backend
// (aruna#273). 204 on success; a 404 means the lease is already gone, which is
// success from the caller's point of view.
async function unsubscribe(groupId: string): Promise<void> {
  assertEnabled()
  unsubscribingIds.value = [...unsubscribingIds.value, groupId]
  try {
    try {
      await request<void>(`/users/subscriptions/${encodeURIComponent(groupId)}`, { method: 'DELETE' })
    } catch (err) {
      // 404 = the lease is already gone; that is the desired end state.
      if (!(err instanceof ApiError && err.status === 404)) throw err
    }
    subscriptions.value = subscriptions.value.filter((s) => s.group_id !== groupId)
  } finally {
    unsubscribingIds.value = unsubscribingIds.value.filter((id) => id !== groupId)
  }
}

export function useSubscriptions() {
  return {
    subscriptionsEnabled,
    subscriptions,
    subscriptionsLoaded,
    subscriptionsError,
    busy,
    unsubscribingIds,
    subscribedGroupIds,
    loadSubscriptions,
    ensureSubscriptionsLoaded,
    subscribe,
    unsubscribe,
  }
}
