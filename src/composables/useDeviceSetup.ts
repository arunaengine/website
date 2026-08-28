// The hand-off Aruna Desktop performs on this machine: it applies a minted
// enrollment to the node the shell embeds, and reads the claim watch as the
// stages an owner sees. Shared by the onboarding lane and the first-run step.
import { computed, onUnmounted, ref } from 'vue'
import type { WatchStage } from '@/components/onboarding/ClaimWatchStep.vue'
import { useDeviceEnrollment, WATCH_INTERVAL_MS, type DeviceWatch } from '@/composables/useDeviceEnrollment'
import { bounded, clearEnrolled, skipSetup } from '@/lib/desktopWelcome'
import { parseEnrollInput } from '@/lib/enrollLink'
import { errorMessage, truncateMiddle } from '@/lib/utils'

// One hour, the mint default. Long enough to install the desktop app, short
// enough that a code left on screen stops working the same session.
export const ENROLLMENT_TTL_SECS = 3600

/** Redeems a minted enrollment on the node this app embeds. */
export async function applyEnrollment(enrollUrl: string | null | undefined, label = ''): Promise<void> {
  const input = enrollUrl ? parseEnrollInput(enrollUrl) : null
  if (!input) throw new Error('This node returned no enrollment link for the device.')
  const { enrollApply } = await import('@/lib/desktopBridge')
  await enrollApply({ ...input, ...(label ? { label } : {}) })
}

/** The claim watch as a timeline: minted, claimed by the device, joined. */
export function watchStages(state: DeviceWatch): WatchStage[] {
  const short = state.nodeId ? truncateMiddle(state.nodeId, 8, 6) : undefined
  const stages: WatchStage[] = [{ key: 'minted', label: 'Enrollment code created', state: 'done' }]

  if (state.phase === 'expired') {
    stages.push({
      key: 'claim',
      label: 'Claimed by the device',
      state: 'failed',
      detail: 'The code expired before any device claimed it.',
    })
    stages.push({ key: 'join', label: 'Joined the realm', state: 'pending' })
    return stages
  }

  const claimed = state.phase === 'claimed' || state.phase === 'present'
  const joined = state.phase === 'present'
  stages.push({
    key: 'claim',
    label: claimed ? 'Claimed by the device' : 'Waiting for the device to claim the code',
    state: claimed ? 'done' : 'active',
    detail: claimed ? short : undefined,
  })
  stages.push({
    key: 'join',
    label: joined ? 'Joined the realm' : 'Joining the realm',
    state: joined ? 'done' : claimed ? 'active' : 'pending',
    detail: joined ? short : undefined,
  })
  return stages
}

/**
 * First-run device setup: mints an enrollment for this account, redeems it on
 * the embedded node and follows it until the device joined. The step keeps its
 * watch in memory while the node restarts under it. Must be called during
 * component setup (useDeviceEnrollment registers onUnmounted).
 */
export function useDeviceSetup() {
  const { minting, mintError, watch: state, mint, startWatch, resetWatch } = useDeviceEnrollment()
  const applying = ref(false)
  const applyError = ref<string | null>(null)
  const watching = ref(false)
  const enrolledHere = ref(false)

  let timer: ReturnType<typeof setInterval> | undefined

  const busy = computed(() => applying.value || minting.value)
  const error = computed(() => mintError.value ?? applyError.value)
  const joined = computed(() => state.value.phase === 'present' || enrolledHere.value)
  const stages = computed(() => watchStages(state.value))

  async function apply(label: string): Promise<void> {
    if (busy.value) return
    applying.value = true
    applyError.value = null
    try {
      const { response, enrollmentId } = await mint(ENROLLMENT_TTL_SECS)
      await applyEnrollment(response.enroll_url, label)
      watching.value = true
      startWatch(enrollmentId, response.expires_at)
      void follow()
    } catch (err) {
      // mint already worded its own failures.
      if (!mintError.value) applyError.value = errorMessage(err)
    } finally {
      applying.value = false
    }
  }

  async function probe(): Promise<void> {
    try {
      const { nodeStatus } = await import('@/lib/desktopBridge')
      // A probe must never outlive its own tick.
      if ((await bounded(nodeStatus(), WATCH_INTERVAL_MS)).enrolled) enrolledHere.value = true
    } catch {
      // The realm-side watch still reports what the shell cannot.
    }
  }

  // The shell spends the secret and settles the enrollment inside node_status
  // alone, so the step keeps asking: without it the device joins the realm and
  // the shell never learns of it.
  function follow(): Promise<void> {
    if (timer !== undefined) return Promise.resolve()
    timer = setInterval(() => void probe(), WATCH_INTERVAL_MS)
    return probe()
  }

  function unfollow(): void {
    clearInterval(timer)
    timer = undefined
  }

  /** Answers the prompt for good: a joined device is not asked again either. */
  function done(): void {
    unfollow()
    skipSetup()
    clearEnrolled()
    resetWatch()
  }

  onUnmounted(unfollow)

  return { applying: busy, error, watching, joined, stages, state, apply, done }
}
