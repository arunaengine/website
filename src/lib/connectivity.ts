// Connectivity model for the offline portal (aruna#273).
//
// Two independent signals:
//  - browserOnline: navigator.onLine + window online/offline events. False
//    means the device has no network — but a portal served by the LOCAL node
//    (laptop user node) still reaches its API over loopback.
//  - networkFailing: flipped by apiRequest — true on a non-abort fetch
//    rejection (the serving node is unreachable), false again on any
//    completed HTTP response (any status proves reachability).
//
// offline = either signal; writesDisabled = offline (per aruna#273, writes
// always need connectivity — a lease-holding local node is read-only).
//
// Lives in lib/ (not composables/) because src/lib/api.ts must report fetch
// outcomes here and lib must not import from the composable layer. Imports
// only vue, so api.ts -> connectivity.ts is cycle-free.
import { computed, ref, watch } from 'vue'

const browserOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)
const networkFailing = ref(false)
const offlineSince = ref<number | null>(null)

const offline = computed(() => !browserOnline.value || networkFailing.value)
const online = computed(() => !offline.value)
// True while the device is offline but the serving node still answers
// (local-node scenario): reads keep working over the node's local data.
const nodeReachable = computed(() => !networkFailing.value)
const writesDisabled = computed(() => offline.value)

export const OFFLINE_WRITE_HINT = 'You appear to be offline — writing needs connectivity.'

// Called by apiRequest. Deliberate cancellations (AbortController, used by
// the debounced search composable) say nothing about connectivity.
export function noteFetchFailure(err: unknown): void {
  if (err instanceof DOMException && err.name === 'AbortError') return
  networkFailing.value = true
}

export function noteFetchSuccess(): void {
  networkFailing.value = false
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    browserOnline.value = true
    // Optimistic: the next failed fetch re-flags networkFailing.
    networkFailing.value = false
  })
  window.addEventListener('offline', () => {
    browserOnline.value = false
  })
  // Module singleton; intentionally never disposed (same lifetime as useAruna).
  watch(offline, (now) => {
    offlineSince.value = now ? Date.now() : null
  })
}

export function useConnectivity() {
  return { online, offline, browserOnline, networkFailing, nodeReachable, offlineSince, writesDisabled }
}
