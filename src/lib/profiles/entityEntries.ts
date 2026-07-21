import { effectiveEntitySources } from './sources'
import { isAbsoluteUri } from './uri'
import type { ProfileEntitySource } from './types'

// The combined reuse-or-create model for entity-valued dataset fields (plan
// Phase 4): each field manages ONE ordered list of entries, where every entry
// is either a described-new instance (sub-form values) or a reuse reference
// (an absolute URI, or a crate-local data-reference id). The two reuse
// flavours share one entry kind — which inputs a reuse entry offers comes from
// the rule's entitySources policy, and a value is classified structurally
// (crate ids are picked from the current data references, everything else
// must be an absolute URI).

export type EntityEntrySource = 'new' | 'existing'

export interface EntityEntry {
  // Stable per-entry identity for card keying/collapse state (never emitted).
  __uid: number
  source: EntityEntrySource
  // source 'new': sub-form values keyed by sub-control property.
  instance?: Record<string, unknown>
  // source 'existing': the reference id/URI as typed or picked.
  ref?: string
  // source 'new', optional: an author-chosen @id for the described entity,
  // overriding the synthetic `#<type>-<name>` (and the identifier-derived) id.
  // Normalized by normalizedCustomId at emission.
  customId?: string
}

export interface EntrySourcePolicy {
  allowNew: boolean
  allowExternal: boolean
  allowCrate: boolean
  // Convenience: at least one reuse flavour is allowed.
  allowExisting: boolean
}

export function entrySourcePolicy(sources: ProfileEntitySource[] | undefined): EntrySourcePolicy {
  const effective = effectiveEntitySources(sources)
  const allowExternal = effective.includes('existing-external')
  const allowCrate = effective.includes('existing-crate')
  return {
    allowNew: effective.includes('new'),
    allowExternal,
    allowCrate,
    allowExisting: allowExternal || allowCrate,
  }
}

// A described-new entry's author-typed identifier, normalized for emission: an
// absolute URI is used as-is, anything else becomes a crate-local #id (the #
// prefix is added when missing). Blank/whitespace means "no override", so the
// synthetic id derivation applies. Two entries naming the same @id merge into
// one entity at emission (addEntity dedupes by @id), which is the deliberate
// way to reference one described entity from several properties.
export function normalizedCustomId(entry: EntityEntry): string | undefined {
  if (entry.source !== 'new') return undefined
  const raw = (entry.customId ?? '').trim()
  if (!raw) return undefined
  if (isAbsoluteUri(raw)) return raw
  return raw.startsWith('#') ? raw : `#${raw}`
}

// The reference an 'existing' entry effectively contributes, or '' when it
// contributes nothing: blanks are dropped (an empty row never satisfies
// presence and never emits), and a crate-only policy drops ids that no longer
// resolve to a current data reference (a removed data reference must resurface
// its presence violation instead of emitting a dangling {"@id"} — M4). A
// policy that allows external reuse keeps any non-blank value: invalid URIs
// count as provided but are blocked by the format check (entryRefInvalid).
export function effectiveEntryRef(
  entry: EntityEntry,
  policy: EntrySourcePolicy,
  validCrateIds: ReadonlySet<string>,
): string {
  if (entry.source !== 'existing') return ''
  const ref = (entry.ref ?? '').trim()
  if (!ref) return ''
  if (policy.allowCrate && validCrateIds.has(ref)) return ref
  if (policy.allowExternal) return ref
  return ''
}

// Blocking format error for a reuse entry: a non-blank reference that is
// neither a current data reference (when crate reuse is allowed) nor an
// absolute URI (when external reuse is allowed). Crate-only stale ids are NOT
// format errors — they are pruned (effectiveEntryRef) so the presence check
// fires instead. Reuse-by-URI is checked as a reference only; the target's
// own shape rules apply exclusively to described-new entries (plan 5.4).
export function entryRefInvalid(
  entry: EntityEntry,
  policy: EntrySourcePolicy,
  validCrateIds: ReadonlySet<string>,
): boolean {
  if (entry.source !== 'existing') return false
  const ref = (entry.ref ?? '').trim()
  if (!ref) return false
  if (policy.allowCrate && validCrateIds.has(ref)) return false
  if (!policy.allowExternal) return false
  return !isAbsoluteUri(ref)
}

// The values a control's entries contribute to schema validation: described-new
// entries contribute their instance record (an entry the author added counts
// as present even while its fields are still empty — its own sub-form errors
// flag what is missing), reuse entries contribute their effective reference.
// Presence and list cardinality therefore act on the COMBINED entry count.
// Entries pointing at the same @id each count here (identity is only known at
// emission, where emitEntityEntries dedupes the repeated reference).
export function effectiveEntryValues(
  entries: EntityEntry[],
  policy: EntrySourcePolicy,
  validCrateIds: ReadonlySet<string>,
): Array<Record<string, unknown> | string> {
  const values: Array<Record<string, unknown> | string> = []
  for (const entry of entries) {
    if (entry.source === 'new') values.push(entry.instance ?? {})
    else {
      const ref = effectiveEntryRef(entry, policy, validCrateIds)
      if (ref) values.push(ref)
    }
  }
  return values
}
