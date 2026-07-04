import type { ProfileObligation, ProfileValueKind } from './types'

// Single source of truth for how value kinds are labelled in the UI.
export const PROFILE_VALUE_KIND_LABELS: Record<ProfileValueKind, string> = {
  text: 'Single line',
  longtext: 'Long text',
  integer: 'Integer',
  number: 'Number',
  boolean: 'Boolean',
  url: 'URL',
  email: 'Email',
  date: 'Date',
  datetime: 'Date-time',
  'keyword-list': 'Keywords',
  'person-list': 'People',
  license: 'License',
  enum: 'One of',
  'file-reference': 'File reference',
}

// Single source of truth for how RFC-2119 obligations are labelled and explained.
export const PROFILE_OBLIGATION_LABELS: Record<ProfileObligation, { label: string; help: string }> = {
  MUST: { label: 'Required', help: 'Required — validation fails without it' },
  SHOULD: { label: 'Recommended', help: 'Recommended — warns when missing' },
  MAY: { label: 'Optional', help: 'Optional' },
}
