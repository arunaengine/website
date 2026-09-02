// The node check the profile tutorial shows: an accepted verdict for the draft
// the reader built, produced without asking a node.
import type { ProfileValidationPreviewResponse } from '@/lib/api'

export async function tutorialPreview(): Promise<ProfileValidationPreviewResponse> {
  return {
    accepted: true,
    state: 'valid',
    evaluator: 'tutorial',
    findings: [],
    completeness: 'complete',
    structural_violations: [],
  }
}
