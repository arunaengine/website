// Short words for file rules, kept apart from the components so tests reach them.
import type { FileRule, FileRulePreview } from '@/lib/api'

export const OUTCOME_WORDS: Record<FileRulePreview['outcome'], string> = {
  known: 'Kept',
  matched: 'Sorted',
  root: 'Stays',
  conflict: 'Conflict',
}

/** The rules worth sending: blank rows dropped, a folder ending with `/`. */
export function cleanRules(rules: FileRule[]): FileRule[] {
  return rules
    .map((rule) => ({ pattern: rule.pattern.trim(), folder: rule.folder.trim() }))
    .filter((rule) => rule.pattern || rule.folder)
    .map((rule) => ({ ...rule, folder: !rule.folder || rule.folder.endsWith('/') ? rule.folder : `${rule.folder}/` }))
}

/** A row with only one field filled is an error; a blank row is not. */
export function ruleProblem(rule: FileRule): string | null {
  const pattern = rule.pattern.trim()
  const folder = rule.folder.trim()
  if (!pattern && !folder) return null
  if (!pattern) return 'Add a file name.'
  return folder ? null : 'Add a folder.'
}

/** How many listed files a rule sorts and how many stay where they are. */
export function previewCounts(files: FileRulePreview[]): { matched: number; unmatched: number; conflicts: number } {
  const count = (outcome: FileRulePreview['outcome']) => files.filter((file) => file.outcome === outcome).length
  return { matched: count('matched'), unmatched: count('root') + count('known'), conflicts: count('conflict') }
}
