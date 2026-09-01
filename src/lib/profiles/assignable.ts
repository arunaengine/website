// Who may tag a dataset with which profile, in one place (decision P9). The
// portal shows the rule everywhere it matters; the node is the authority.
import type { MetadataProfile } from '@/data/types'

/**
 * Group-scoped assignment: a private profile is usable by datasets of its own
 * group. The node still resolves PUBLIC profiles only
 * (operations/src/metadata/profile_validation.rs reads the profile without a
 * caller identity), so the portal keeps the rule off until that lands. Flip
 * this constant, and the sentence under the editor's profile select, when it
 * does.
 */
export const GROUP_SCOPED_PROFILES: boolean = false

export type ProfileScope = 'Public' | 'Group only' | 'Built-in'

/** True when a dataset in `groupId` may declare this profile. */
export function isAssignableProfile(profile: MetadataProfile, groupId?: string): boolean {
  if (profile.builtIn || profile.managed) return true
  return GROUP_SCOPED_PROFILES && Boolean(groupId) && profile.groupId === groupId
}

/** How the profile's reach is named in lists and badges. */
export function profileScope(profile: MetadataProfile): ProfileScope {
  if (profile.builtIn) return 'Built-in'
  return profile.managed ? 'Public' : 'Group only'
}

/** Why a profile the reader can see is missing from a dataset's picker. */
export const PROFILE_SCOPE_REASON = GROUP_SCOPED_PROFILES
  ? "Only public profiles and profiles of this dataset's group can be assigned."
  : 'Only public profiles can be assigned to a dataset.'
