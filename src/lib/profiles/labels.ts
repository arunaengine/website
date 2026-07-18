import type { ProfileObligation, ProfileReferenceMode, ProfileValueKind } from './types'

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

// Single source of truth for how entity-reference modes are labelled and explained
// (the reference-mode radio in the profile builder, wave B1). `inline` is the
// legacy default; the `#id`-vs-identifier-URI behaviour is spelled out so it is no
// longer invisible to authors.
export const PROFILE_REFERENCE_MODE_LABELS: Record<ProfileReferenceMode, { label: string; help: string }> = {
  inline: {
    label: 'Inline entity (filled out as a sub-form)',
    help: 'Author fills a sub-form; it becomes a contextual entity. An absolute-URI identifier (e.g. an ORCID) becomes its @id, otherwise a local #id is generated.',
  },
  external: {
    label: 'External URI (ORCID / ROR / DOI…)',
    help: 'A single URI field; emitted as a bare {"@id"} reference to a persistent external identifier, never an inline entity.',
  },
  crate: {
    label: 'Entity in this crate (e.g. an attached file)',
    help: 'References another entity in the same crate, e.g. a file picked from the crate contents; emitted as a crate-local {"@id"} reference.',
  },
}

// The order reference modes are listed in the builder radio.
export const REFERENCE_MODE_ORDER: ProfileReferenceMode[] = ['inline', 'external', 'crate']

// Single source of truth for how RFC-2119 obligations are labelled and explained.
export const PROFILE_OBLIGATION_LABELS: Record<ProfileObligation, { label: string; help: string }> = {
  MUST: { label: 'Required', help: 'Required, validation fails without it' },
  SHOULD: { label: 'Recommended', help: 'Recommended, warns when missing' },
  MAY: { label: 'Optional', help: 'Optional' },
}

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
