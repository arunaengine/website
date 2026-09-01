import type { ProfileEntitySource, ProfileObligation, ProfileValueKind } from './types'

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
  enum: 'One of',
  entity: 'Entity reference',
  'select-url': 'URL (choose from an allowed list)',
  'select-object': 'Object choice',
}

// Single source of truth for how entity sources are labelled and explained (the
// allowed-sources checkboxes in the profile builder). A rule may allow several;
// the sentence frame is "Dataset authors may: <label> / <label>".
export const PROFILE_ENTITY_SOURCE_LABELS: Record<ProfileEntitySource, { label: string; help: string }> = {
  new: {
    label: 'Describe a new entity (sub-form)',
    help: 'The author fills the entity rules as a sub-form; it becomes a contextual entity. An absolute-URI identifier (e.g. an ORCID) becomes its @id, otherwise a local #id is generated.',
  },
  'existing-external': {
    label: 'Reuse via external URI (ORCID / ROR / DOI…)',
    help: 'A URI field emitted as a bare {"@id"} reference to a persistent external identifier; its fields are never re-entered and only the reference itself can be validated.',
  },
  'existing-crate': {
    label: 'Reuse an entity in this RO-Crate (e.g. an attached file)',
    help: 'References another entity in the same RO-Crate, e.g. a file picked from its contents; emitted as an RO-Crate-local {"@id"} reference.',
  },
}

// Single source of truth for how RFC-2119 obligations are labelled and explained.
export const PROFILE_OBLIGATION_LABELS: Record<ProfileObligation, { label: string; help: string }> = {
  MUST: { label: 'Required', help: 'Required, validation fails without it' },
  SHOULD: { label: 'Recommended', help: 'Recommended, warns when missing' },
  MAY: { label: 'Optional', help: 'Optional' },
}

// One sentence for the obligation control itself, beside the per-level help.
export const OBLIGATION_HELP =
  'How strictly the profile asks for this property: Required fails validation when missing, Recommended warns, Optional never complains.'

// The order obligations are grouped/listed in throughout the UI.
export const OBLIGATION_ORDER: ProfileObligation[] = ['MUST', 'SHOULD', 'MAY']

// Single source of truth for obligation → Badge variant (MUST → royal,
// SHOULD → amber "warn", MAY → muted "secondary").
export function obligationBadgeVariant(obligation: ProfileObligation): 'royal' | 'warn' | 'secondary' {
  if (obligation === 'MUST') return 'royal'
  if (obligation === 'SHOULD') return 'warn'
  return 'secondary'
}

// Left-accent (Tailwind border-l) class per obligation, matching the badge mapping.
export const OBLIGATION_ACCENT: Record<ProfileObligation, string> = {
  MUST: 'border-l-aruna-royal/60',
  SHOULD: 'border-l-amber-500/60',
  MAY: 'border-l-border',
}
