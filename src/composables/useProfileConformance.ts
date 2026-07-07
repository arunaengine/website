import { computed, ref, watch, type ComputedRef } from 'vue'
import { useAruna } from './useAruna'
import { evaluateCrate, type ProfileEvaluation } from '@/lib/profiles/evaluate'
import type { MetadataDoc, MetadataProfile } from '@/data/types'

export type ConformanceState = 'none' | 'unknown' | 'checking' | 'conformant' | 'warnings' | 'errors'

export interface DocConformance {
  state: ConformanceState
  evaluations: Array<{ profile: MetadataProfile; evaluation: ProfileEvaluation }>
  // Declared conformsTo IRIs that resolve to no local profile — honestly unchecked.
  uncheckedIris: string[]
  errorCount: number
  warningCount: number
}

const NONE: DocConformance = { state: 'none', evaluations: [], uncheckedIris: [], errorCount: 0, warningCount: 0 }

// Evaluate a stored metadata document against the local profiles it declares
// conformance to. Purely reactive over the useAruna crate cache: a profile is
// scored only when BOTH the doc's full crate and the profile's full crate are
// cached (a truncated rocrate_summary would fabricate hasPart misses / lose
// rules). `fetch: true` (detail view) warms those crates; the search grid omits
// it so browsing never triggers N crate fetches.
export function useProfileConformance(
  doc: () => MetadataDoc | undefined,
  options: { fetch?: boolean } = {},
): { conformance: ComputedRef<DocConformance> } {
  const { profiles, fullCrates, loadRoCrate } = useAruna()

  // Local profiles resolved from the doc's conformsTo (profileIds are slugs).
  const localProfiles = computed<MetadataProfile[]>(() => {
    const current = doc()
    if (!current) return []
    return (current.profileIds ?? [])
      .map((slug) => profiles.value.find((profile) => profile.id === slug))
      .filter((profile): profile is MetadataProfile => Boolean(profile))
  })

  // conformsTo IRIs that matched no local profile graph IRI — reported as "not checked".
  const uncheckedIris = computed<string[]>(() => {
    const current = doc()
    if (!current) return []
    const checked = new Set(localProfiles.value.map((profile) => profile.graphIri).filter(Boolean))
    return (current.conformsToIds ?? []).filter((iri) => !checked.has(iri))
  })

  // Dedupe guard + reactive pending count so 'checking' distinguishes from 'unknown'.
  const inFlight = new Set<string>()
  const pending = ref(0)

  async function ensure(documentId: string) {
    if (fullCrates.value[documentId] || inFlight.has(documentId)) return
    inFlight.add(documentId)
    pending.value += 1
    try {
      await loadRoCrate(documentId)
    } catch {
      // Includes CrateNotReadyError — leave the state unknown/checking; a re-visit retries.
    } finally {
      inFlight.delete(documentId)
      pending.value -= 1
    }
  }

  if (options.fetch) {
    watch(
      () => doc()?.ulid,
      (ulid) => {
        if (!ulid) return
        void ensure(ulid)
        for (const profile of localProfiles.value) if (profile.documentId) void ensure(profile.documentId)
      },
      { immediate: true },
    )
    // Local profiles resolve asynchronously (profileItems load + mapProfile reparse);
    // warm their crates once they appear so mapProfile can upgrade to full rules.
    watch(localProfiles, (list) => {
      for (const profile of list) if (profile.documentId) void ensure(profile.documentId)
    })
  }

  const conformance = computed<DocConformance>(() => {
    const current = doc()
    if (!current || !(current.conformsToIds ?? []).length) return NONE

    const docCrate = fullCrates.value[current.ulid]
    const evaluations: DocConformance['evaluations'] = []
    if (docCrate) {
      for (const profile of localProfiles.value) {
        // Rules must have come from the full crate, not a truncated summary.
        if (!(profile.documentId && fullCrates.value[profile.documentId])) continue
        evaluations.push({
          profile,
          evaluation: evaluateCrate(docCrate, {
            slug: profile.id,
            schema: profile.schema,
            entityRules: profile.entityRules,
            datasetPropertyRules: profile.propertyRules,
          }),
        })
      }
    }

    const errorCount = evaluations.reduce((sum, entry) => sum + entry.evaluation.errorCount, 0)
    const warningCount = evaluations.reduce((sum, entry) => sum + entry.evaluation.warningCount, 0)

    let state: ConformanceState
    if (!evaluations.length) state = options.fetch && pending.value > 0 ? 'checking' : 'unknown'
    else if (errorCount) state = 'errors'
    else if (warningCount) state = 'warnings'
    else state = 'conformant'

    return { state, evaluations, uncheckedIris: uncheckedIris.value, errorCount, warningCount }
  })

  return { conformance }
}
