import type { ProfileEntitySource } from './types'

// Canonical order for entity sources everywhere (storage, schema anyOf branches,
// UI listing): describe-new first, then the two reuse flavours.
export const ENTITY_SOURCE_ORDER: ProfileEntitySource[] = ['new', 'existing-external', 'existing-crate']

// The recommended default policy for NEW builder rules: a dataset author may
// reuse an existing entity or describe a new one (plan section 5.4). Stored
// explicitly; only the legacy ['new'] policy is stored as absent.
export const ALL_ENTITY_SOURCES: ProfileEntitySource[] = [...ENTITY_SOURCE_ORDER]

// The sources a rule/control effectively allows: absent/empty means the legacy
// inline default, ['new']. Always returns a fresh array in canonical order with
// duplicates removed.
export function effectiveEntitySources(sources: ProfileEntitySource[] | undefined): ProfileEntitySource[] {
  const set = new Set(sources ?? [])
  const ordered = ENTITY_SOURCE_ORDER.filter((source) => set.has(source))
  return ordered.length ? ordered : ['new']
}

// Canonical stored form: order-normalized and deduped, with the legacy default
// (exactly ['new']) collapsing to undefined so presence-only schema emission
// stays byte-stable for inline-only rules.
export function normalizeEntitySources(
  sources: ProfileEntitySource[] | undefined,
): ProfileEntitySource[] | undefined {
  const effective = effectiveEntitySources(sources)
  return effective.length === 1 && effective[0] === 'new' ? undefined : effective
}

// Which single input the dataset dialog renders for an entity control until the
// combined reuse-or-create control (Phase 4) lands: the sub-form whenever `new`
// is allowed, else the external-URI input, else the crate picker.
export function primaryEntityInput(sources: ProfileEntitySource[] | undefined): ProfileEntitySource {
  const effective = effectiveEntitySources(sources)
  if (effective.includes('new')) return 'new'
  if (effective.includes('existing-external')) return 'existing-external'
  return 'existing-crate'
}
