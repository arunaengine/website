// One row template for every editable row in the dataset editor, so the root
// form and the property rows of every entity share their label and action
// columns. Changing it here moves every row at once.

export const ROW_GRID = 'grid grid-cols-[11rem_minmax(0,1fr)_auto] items-start gap-2 px-5 py-2.5'

export const ROW_LABEL = 'flex min-w-0 items-center gap-1 pt-2 text-sm font-medium text-foreground'

export const ROW_ACTIONS = 'flex w-20 shrink-0 items-center justify-end gap-1'
