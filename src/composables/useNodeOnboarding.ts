// Node onboarding (portal part of aruna#277). All three admin endpoints exist
// on today's backend, so nothing here is config-gated.
//
// Per-view FACTORY, not a module singleton like useAruna: the 5s claim/presence
// watch interval is bound to the lifetime of the one view that mints a secret,
// and two views must never share a watcher. Must be called during component
// setup (registers onUnmounted). Builds its API client from useAruna's exported
// apiBaseUrl/authToken refs (precedent: useJoinRequests) and reuses
// loadInfo/realmInfo for node presence (precedent: StatusView).
import { onUnmounted, ref } from 'vue'
import {
  ApiError,
  apiRequest,
  type CreateOnboardingSecretRequest,
  type CreateOnboardingSecretResponse,
  type ListOnboardingSecretsResponse,
  type OnboardingSecretSummary,
} from '@/lib/api'
import { useAruna } from '@/composables/useAruna'

// expires_at above this (unix seconds ≈ year 2286) means "never expires": the
// initial admin-claim secret is stored with u64::MAX, which JSON parses to a
// value far beyond any real TTL (the server clamps real TTLs to <= 86400s).
export const NEVER_EXPIRES_AFTER = 10_000_000_000

// Claim detection / presence polling cadence.
const WATCH_INTERVAL_MS = 5_000

export type SecretStatus = 'outstanding' | 'claimed' | 'expired'

// A claimed secret stays 'claimed' even past its TTL (a Finalizing secret
// survives pruning). Never-expiring secrets (u64::MAX) are always outstanding.
export function secretStatus(
  s: OnboardingSecretSummary,
  nowSecs = Date.now() / 1000,
): SecretStatus {
  if (s.claimed_node_id) return 'claimed'
  if (s.expires_at <= NEVER_EXPIRES_AFTER && s.expires_at < nowSecs) return 'expired'
  return 'outstanding'
}

export type WatchPhase = 'idle' | 'waiting-claim' | 'waiting-presence' | 'connected' | 'expired'

export interface WatchState {
  phase: WatchPhase
  enrollmentId: string | null
  claimedBy: string | null
  // Presence only completes for node claims; a Local secret redeemed at
  // registration ends at 'waiting-presence' with claimedIsNode=false.
  claimedIsNode: boolean
  // Transient poll errors surface inline; never reportGlobalError per tick.
  lastError: string | null
}

function idleWatch(): WatchState {
  return { phase: 'idle', enrollmentId: null, claimedBy: null, claimedIsNode: false, lastError: null }
}

export function useNodeOnboarding() {
  const { apiBaseUrl, authToken, realmInfo, loadInfo } = useAruna()

  const secrets = ref<OnboardingSecretSummary[]>([])
  const listing = ref(false)
  const listError = ref<string | null>(null)
  const minting = ref(false)
  const mintError = ref<string | null>(null)
  const revokingIds = ref<Set<string>>(new Set())
  const watch = ref<WatchState>(idleWatch())

  // Sibling to useAruna: it does not export its raw request() helper, but it
  // does export the apiBaseUrl/authToken refs, so we build the same client.
  function request<T>(path: string, options = {}) {
    return apiRequest<T>(path, options, { baseUrl: apiBaseUrl.value, token: authToken.value })
  }

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError) return err.message
    if (err instanceof Error) return err.message
    return String(err)
  }

  function nowSecs(): number {
    return Date.now() / 1000
  }

  async function refreshSecrets(): Promise<void> {
    listing.value = true
    try {
      const response = await request<ListOnboardingSecretsResponse>('/admin/onboarding/secrets')
      secrets.value = response.secrets
      listError.value = null
    } catch (err) {
      // A 403 here means the view's gate copy takes over; keep the raw message.
      listError.value = errorMessage(err)
    } finally {
      listing.value = false
    }
  }

  // The create response never carries the enrollment_id (it is embedded in the
  // encoded secret, which must not be decoded client-side), so diff the list
  // before/after the POST to recover it. The exact expires_at + mode match
  // disambiguates concurrent mints; a null id only degrades the watcher.
  function pickNewEnrollment(
    before: Set<string>,
    response: CreateOnboardingSecretResponse,
  ): string | null {
    const exact = secrets.value.find(
      (s) =>
        !before.has(s.enrollment_id) &&
        s.mode === response.mode &&
        s.expires_at === response.expires_at,
    )
    if (exact) return exact.enrollment_id
    return secrets.value.find((s) => !before.has(s.enrollment_id))?.enrollment_id ?? null
  }

  async function mint(
    input: CreateOnboardingSecretRequest,
  ): Promise<{ response: CreateOnboardingSecretResponse; enrollmentId: string | null }> {
    minting.value = true
    mintError.value = null
    try {
      // Snapshot current ids (tolerate a failed pre-refresh); anything new after
      // the POST is our secret.
      await refreshSecrets().catch(() => undefined)
      const before = new Set(secrets.value.map((s) => s.enrollment_id))
      const response = await request<CreateOnboardingSecretResponse>('/admin/onboarding/secrets', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      await refreshSecrets().catch(() => undefined)
      return { response, enrollmentId: pickNewEnrollment(before, response) }
    } catch (err) {
      mintError.value = errorMessage(err)
      throw err
    } finally {
      minting.value = false
    }
  }

  function markRevoking(id: string, active: boolean) {
    const next = new Set(revokingIds.value)
    if (active) next.add(id)
    else next.delete(id)
    revokingIds.value = next
  }

  async function revoke(id: string): Promise<void> {
    markRevoking(id, true)
    let failure: string | null = null
    try {
      await request<void>(`/admin/onboarding/secrets/${encodeURIComponent(id)}`, { method: 'DELETE' })
    } catch (err) {
      // A 404 means the secret was already pruned or claimed-and-expired; the
      // row is gone either way, so treat it as a successful revoke.
      if (!(err instanceof ApiError && err.status === 404)) {
        failure = errorMessage(err)
      }
    } finally {
      // Refresh first (it clears listError on success), THEN surface the revoke
      // failure; otherwise a still-working list endpoint erases the message.
      await refreshSecrets().catch(() => undefined)
      if (failure) listError.value = failure
      markRevoking(id, false)
    }
  }

  // --- Claim watcher -------------------------------------------------------
  let timer: number | undefined
  let watchExpiresAt = 0
  let nodesBefore = new Set<string>()

  function patchWatch(patch: Partial<WatchState>) {
    watch.value = { ...watch.value, ...patch }
  }

  function newRealmNode(): string | undefined {
    return (realmInfo.value?.nodes ?? []).map((n) => n.node_id).find((id) => !nodesBefore.has(id))
  }

  function endExpired() {
    patchWatch({ phase: 'expired' })
    stopWatch()
  }

  async function tick() {
    try {
      if (watch.value.phase === 'waiting-claim') {
        await refreshSecrets()
        // refreshSecrets swallows its own errors into listError; mirror it so a
        // network hiccup during claim-watch reaches the inline strip (and clears
        // itself on the next successful tick).
        patchWatch({ lastError: listError.value })
        const row = secrets.value.find((s) => s.enrollment_id === watch.value.enrollmentId)
        if (row?.claimed_node_id) {
          // claimedIsNode is confirmed against realmInfo.nodes in waiting-presence.
          patchWatch({ phase: 'waiting-presence', claimedBy: row.claimed_node_id })
        } else if (!row) {
          // The secret was consumed and pruned before we caught claimed_node_id:
          // fall back to any realm node that appeared since the mint.
          const joined = newRealmNode()
          if (joined) patchWatch({ phase: 'waiting-presence', claimedBy: joined })
          else if (nowSecs() > watchExpiresAt) endExpired()
        } else if (nowSecs() > watchExpiresAt) {
          endExpired()
        }
      } else if (watch.value.phase === 'waiting-presence') {
        await loadInfo()
        const node = (realmInfo.value?.nodes ?? []).find((n) => n.node_id === watch.value.claimedBy)
        if (node) {
          const connected = node.connection_status === 'connected' || node.present
          patchWatch({ claimedIsNode: true, phase: connected ? 'connected' : 'waiting-presence' })
          if (connected) stopWatch()
        } else {
          // claimedBy matches no realm node: either the joining node has not
          // booted yet (keep polling) or it is a Local secret redeemed at
          // registration (admin claim), whose user id "{ulid}@{realm}" carries
          // an '@' that no iroh node id has and never appears as a node: stop.
          patchWatch({ claimedIsNode: false })
          if (watch.value.claimedBy?.includes('@')) stopWatch()
        }
      }
    } catch (err) {
      // Transient network hiccups must not kill the watch; surface inline.
      patchWatch({ lastError: errorMessage(err) })
    }
  }

  function startWatch(enrollmentId: string | null, expiresAt: number, nodeIds: string[]) {
    stopWatch()
    watchExpiresAt = expiresAt
    nodesBefore = new Set(nodeIds)
    watch.value = {
      phase: 'waiting-claim',
      enrollmentId,
      claimedBy: null,
      claimedIsNode: false,
      lastError: null,
    }
    void tick()
    timer = window.setInterval(() => void tick(), WATCH_INTERVAL_MS)
  }

  function stopWatch() {
    if (timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  function resetWatch() {
    stopWatch()
    watch.value = idleWatch()
  }

  // Consumers cannot leak the interval: it is always cleared when the owning
  // view unmounts.
  onUnmounted(stopWatch)

  return {
    secrets,
    listing,
    listError,
    minting,
    mintError,
    revokingIds,
    watch,
    refreshSecrets,
    mint,
    revoke,
    startWatch,
    stopWatch,
    resetWatch,
  }
}
