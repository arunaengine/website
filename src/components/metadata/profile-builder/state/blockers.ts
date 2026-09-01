// Everything that keeps the Create button disabled, in one list, so the review
// summary and the button can never disagree about whether the profile is ready.
import type { RouteLocationRaw } from 'vue-router'

export interface ProfileBlocker {
  message: string
  /** Where the author fixes it: a wizard step, or a page elsewhere. */
  action?: { label: string; step?: number; route?: RouteLocationRaw }
}

export interface BlockerInput {
  errors: readonly string[]
  duplicateName: string
  isPublic: boolean
  hasEndpoint: boolean
  hasKey: boolean
  publishing: boolean
}

export function profileBlockers(input: BlockerInput): ProfileBlocker[] {
  const blockers: ProfileBlocker[] = input.errors.map((message) => ({ message }))
  if (input.duplicateName) {
    blockers.push({ message: input.duplicateName, action: { label: 'Change the name', step: 1 } })
  }
  if (input.isPublic && !input.hasEndpoint) {
    blockers.push({
      message: 'Publishing a public profile needs S3 storage, and this node advertises no S3 endpoint.',
      action: { label: 'Save it as a group profile instead', step: 1 },
    })
  } else if (input.isPublic && !input.hasKey) {
    blockers.push({
      message: 'Publishing a public profile needs S3 credentials for this group.',
      action: { label: 'Create S3 credentials', route: { name: 'settings', query: { tab: 'access' } } },
    })
  }
  if (input.publishing) blockers.push({ message: 'The profile is being created.' })
  return blockers
}
