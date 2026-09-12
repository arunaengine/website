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

/** The input tint of a field the picked profile speaks about. */
export function ruleEmphasis(rule: { obligation: string } | null | undefined): string {
  if (rule?.obligation === 'MUST') return 'border-aruna-royal/40'
  if (rule?.obligation === 'SHOULD') return 'border-amber-500/40'
  return ''
}
