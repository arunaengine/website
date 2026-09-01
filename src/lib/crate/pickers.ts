// Which dialog a reference row opens. A property without an entry gets the
// range-driven default: create an entity (with the ORCID or ROR lookup its
// range implies) or link one already here. A domain-specific picker is one
// line in this registry plus its component, never a locked row.

import { termNameFromUri } from '@/lib/profiles/uri'

export type PickerId = 'data' | 'reference'

const PICKERS: Readonly<Record<string, PickerId>> = { hasPart: 'data' }

export function pickerFor(property: string): PickerId {
  return PICKERS[termNameFromUri(property)] ?? 'reference'
}

/** What the data picker is called on a row, in a menu and in the toolbar. */
export const DATA_PICKER_LABEL = 'Add files'
