// One row template for every editable row in the dataset editor, so the root
// form and the property rows of every entity share their label and action
// columns. Changing it here moves every row at once.

// Below the small breakpoint the value takes its own full-width line under the
// label, and the actions fill the label line, so an input never shrinks to nothing.
export const ROW_GRID = 'grid grid-flow-dense grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-5 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)_auto]'

export const ROW_LABEL = 'flex min-w-0 items-center gap-1 pt-2 text-sm font-medium text-foreground'

export const ROW_VALUE = 'col-span-full min-w-0 sm:col-span-1'

export const ROW_ACTIONS = 'flex w-20 shrink-0 items-center justify-end gap-1'

/**
 * The input classes of a field the picked profile speaks about: the tint of
 * its obligation, and room for the badge inside it while it is still empty.
 */
export function ruleEmphasis(rule: { obligation: string } | null | undefined, empty = false): string {
  const tint = rule?.obligation === 'MUST' ? 'border-aruna-royal/40' : rule?.obligation === 'SHOULD' ? 'border-amber-500/40' : ''
  if (!tint) return ''
  return empty ? `${tint} pr-8 @xs:pr-24` : tint
}
