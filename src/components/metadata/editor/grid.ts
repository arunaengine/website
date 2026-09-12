import type { LiveIssue } from '@/lib/crate/editor'
import { PROFILE_OBLIGATION_LABELS } from '@/lib/profiles/labels'

// One row template for every editable row in the dataset editor, so the root
// form and the property rows of every entity share their label and action
// columns. Changing it here moves every row at once.

// In a row list narrower than 36rem the value takes its own full-width line
// under the label and the actions fill the label line, so an input never
// shrinks to nothing. The list itself is the container the width is read from.
export const ROW_LIST = '@container'

export const ROW_GRID = 'grid grid-flow-dense grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-5 py-2.5 @min-[36rem]:grid-cols-[11rem_minmax(0,1fr)_auto]'

export const ROW_LABEL = 'flex min-w-0 items-center gap-1 pt-2 text-sm font-medium text-foreground'

export const ROW_VALUE = 'col-span-full min-w-0 @container @min-[36rem]:col-span-1'

export const ROW_ACTIONS = 'flex w-20 shrink-0 items-center justify-end gap-1'

/** The border state of a field from its issues: blocking red, advisory amber. */
export function issueState(issues: LiveIssue[]): 'error' | 'warning' | undefined {
  if (issues.some((issue) => issue.severity === 'error')) return 'error'
  return issues.length ? 'warning' : undefined
}

/** The obligation word a field carries for assistive technology. */
export function ruleTitle(rule: { obligation: string } | null | undefined): string | undefined {
  const asked = rule?.obligation
  return asked === 'MUST' || asked === 'SHOULD' ? PROFILE_OBLIGATION_LABELS[asked].label : undefined
}
