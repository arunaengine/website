// The hand-off Aruna Desktop performs on this machine: it applies a minted
// enrollment to the node the shell embeds, and reads the claim watch as the
// stages an owner sees. Shared by the onboarding lane and the first-run step.
import type { WatchStage } from '@/components/onboarding/ClaimWatchStep.vue'
import type { DeviceWatch } from '@/composables/useDeviceEnrollment'
import { parseEnrollInput } from '@/lib/enrollLink'
import { truncateMiddle } from '@/lib/utils'

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
