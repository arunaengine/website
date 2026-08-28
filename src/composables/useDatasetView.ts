// Everything the dataset detail route resolves before it can render: the
// document's own registry entry, its RO-Crate, the profile that labels the
// presented fields, and the presenter output the sections read.
//
// Per-view FACTORY: it owns fetch tokens and the run-provenance poll, so it
// must be called once, from the route view's setup.
import { computed, nextTick, ref, watch } from 'vue'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { useRoute } from 'vue-router'
import { CrateNotReadyError, readableIri, useAruna } from '@/composables/useAruna'
import { useOfflineDoc } from '@/composables/useDeviceSync'
import { ApiError, type MetadataDocumentSummary } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { metaWatchPathPrefix } from '@/lib/watches'
import { parseRunCrate, runClaimedIds } from '@/lib/runCrate'
import { presentCrate } from '@/lib/cratePresenter'
import { licenseLabelOf } from '@/lib/licenses'
import { crateGraph, stringProp } from '@/lib/dataEntities'
import { isProjectCrate, subcrateLinksOf } from '@/lib/subcrates'

export function useDatasetView() {
  const route = useRoute()
  const {
    metadata,
    profiles,
    userInfo,
    bootstrapped,
    loadRoCrate,
    getMetadataDocument,
    toMetadataDoc,
    fullCrates,
    cratePending,
  } = useAruna()

  const loadingCrate = ref(false)
  const crateNotReady = ref(false)
  const crateError = ref<string | null>(null)

  // Honest per-document resolution: the catalog list is not authoritative (it can
  // be stale after a create, and a missing id there is indistinguishable from a
  // private/deleted document), so we fall back to GET /metadata/{id}.
  const docState = ref<'loading' | 'found' | 'preparing' | 'not-found' | 'forbidden' | 'error'>('loading')
  const docError = ref<string | null>(null)
  const fetchedSummary = ref<MetadataDocumentSummary | null>(null)
  const resolvingDoc = ref(false)
  const acceptedPreparing = ref(false)

  const detailId = computed(() => (route.params.id as string) || '')

  // Desktop only: keeping a document on this machine is the shell's business, so
  // on the web `shown` is false and the control never renders.
  const {
    shown: offlineShown,
    selected: offlineSelected,
    busy: offlineBusy,
    setSelected: setOffline,
  } = useOfflineDoc(detailId)

  // Built from this document's own fetch (registry summary plus its crate), not
  // from the catalog listing: the catalog is paged, so most documents are never
  // in it. A loaded catalog row only serves as a placeholder until the fetch
  // lands, so the header does not flash an empty title.
  const current = computed(() => {
    const summary = fetchedSummary.value
    if (!summary) return metadata.value.find((doc) => doc.ulid === detailId.value)
    return toMetadataDoc({ ...summary, rocrate_summary: fullCrates.value[summary.document_id] })
  })
  const currentCrate = computed(() => fullCrates.value[detailId.value] ?? current.value?.roCrate ?? {})
  // Header export/import: export is enabled once the crate has entities; import
  // delegates to the crate section's panel (scrolled into view on open).
  const crateHasEntities = computed(() => crateGraph(currentCrate.value).length > 0)
  const currentProfile = computed(() => profiles.value.find((profile) => profile.id === current.value?.profileId))
  // Keep unresolved conformance paths visible without treating their order as meaningful.
  const conformsIris = computed(() => (currentProfile.value ? [] : current.value?.conformsToIds ?? []))
  const conformsTitle = computed(() => conformsIris.value.join('\n'))
  // A conformsTo IRI that carries its own CreativeWork entity in the crate (e.g.
  // the Process Run Crate profile) shows that entity's name and version; a bare
  // spec URI with no entity falls back to its IRI tail.
  const conformsLabel = computed(() => {
    const iris = conformsIris.value
    if (!iris.length) return 'No profile'
    if (iris.length > 1) return `${iris.length} profiles`
    let iri = ''
    for (const value of iris) iri = value
    const entity = crateGraph(currentCrate.value).find((e) => e['@id'] === iri)
    const name = stringProp(entity?.name)
    if (!name) return readableIri(iri)
    const version = stringProp(entity?.version)
    return version ? `${name} ${version}` : name
  })
  const profileName = computed(() => currentProfile.value?.name ?? conformsLabel.value)
  const profileShortName = computed(() => currentProfile.value?.shortName ?? conformsLabel.value)

  // The document's S3 key path, for the delete confirmation copy.
  const currentPath = computed(() => fetchedSummary.value?.document_path ?? '')

  // The owning group_id is the document's realmId (see mapMetadataDoc), with the
  // registry summary as fallback so documents not (yet) in the catalog listing
  // still expose write actions to group members. Membership is a UI heuristic;
  // the backend still enforces write permission (a 403 surfaces inline).
  const canWrite = computed(() => {
    const groupId = current.value?.realmId ?? fetchedSummary.value?.group_id
    return Boolean(groupId && userInfo.value?.groups.some((g) => g.group_id === groupId))
  })

  // Canonical metadata watch prefix for this document; empty until the owning
  // group and document path are both known.
  const watchPathPrefix = computed(() => {
    const groupId = current.value?.realmId ?? fetchedSummary.value?.group_id
    if (!groupId || !currentPath.value) return ''
    return metaWatchPathPrefix(groupId, currentPath.value)
  })

  let crateFetchToken = 0

  async function fetchCrate(id: string) {
    const token = ++crateFetchToken
    crateError.value = null
    crateNotReady.value = false
    loadingCrate.value = true
    try {
      await loadRoCrate(id)
    } catch (err) {
      if (token !== crateFetchToken) return
      if (err instanceof CrateNotReadyError) crateNotReady.value = true
      else crateError.value = errorMessage(err)
    } finally {
      if (token === crateFetchToken) loadingCrate.value = false
    }
  }

  let resolveToken = 0

  // The document's own registry entry is the authority: it tells missing,
  // private and error apart, which a catalog listing never could.
  async function resolveDoc(id: string) {
    const token = ++resolveToken
    docError.value = null
    fetchedSummary.value = null
    docState.value = 'loading'
    acceptedPreparing.value = false
    if (!id) return
    resolvingDoc.value = true
    try {
      const summary = await getMetadataDocument(id, {
        pollPreparing: true,
        onPreparing: (recentlyCreated) => {
          if (token === resolveToken) {
            acceptedPreparing.value = recentlyCreated
            docState.value = 'preparing'
          }
        },
      })
      if (token !== resolveToken) return
      fetchedSummary.value = summary
      docState.value = 'found'
      await fetchCrate(id)
    } catch (err) {
      if (token !== resolveToken) return
      if (err instanceof CrateNotReadyError) docState.value = 'preparing'
      else if (err instanceof ApiError && (err.status === 404 || err.status === 400)) docState.value = 'not-found'
      else if (err instanceof ApiError && (err.status === 401 || err.status === 403)) docState.value = 'forbidden'
      else {
        docState.value = 'error'
        docError.value = errorMessage(err)
      }
    } finally {
      if (token === resolveToken) resolvingDoc.value = false
    }
  }

  watch(
    // Wait for the initial bootstrap before deciding: the catalog list is empty
    // during the very first load, so an unknown id must not read as not-found.
    [detailId, bootstrapped],
    async ([id, ready]) => {
      crateError.value = null
      crateNotReady.value = false
      if (!id || !ready) {
        docState.value = 'loading'
        return
      }
      await resolveDoc(id)
    },
    { immediate: true },
  )

  // Subcrate links (RO-Crate 1.2 "referencing other RO-Crates" pattern) render in
  // their own section; the Referenced data table below excludes them.
  const subcrateIris = computed(() => new Set(subcrateLinksOf(currentCrate.value).map((link) => link.iri)))
  const projectCrate = computed(() => isProjectCrate(currentCrate.value))

  // A compute run crate (written by the backend at runs/{jobId}) parses into a
  // provenance model; anything else (including a runs/ document whose expected
  // CreateAction is missing) renders the generic data-entity table below.
  const runProvenance = computed(() => parseRunCrate(currentCrate.value, currentPath.value))

  // Ids other sections own: the Subcrates section's linked iris (plus their
  // subjectOf CreativeWork stubs) and the run provenance panel's entities.
  const contextualExclude = computed(() => {
    const ids = new Set<string>()
    for (const link of subcrateLinksOf(currentCrate.value)) {
      ids.add(link.iri)
      if (link.subjectOf) ids.add(link.subjectOf)
    }
    const run = runProvenance.value
    if (run) for (const id of runClaimedIds(run)) ids.add(id)
    return ids
  })

  // Hero License tile: the in-crate license entity's display name, then a
  // well-known SPDX / CC label, then the readable IRI tail, never a bare URL.
  const licenseLabel = computed(() => {
    const iri = current.value?.license
    if (!iri) return ''
    const entity = crateGraph(currentCrate.value).find((e) => e['@id'] === iri)
    return licenseLabelOf(iri, stringProp(entity?.name))
  })

  // The document's profile rules label and order the presented fields. The
  // catalog summary parse is applied immediately; loading the profile's own
  // crate refines it in place (fullCrates is reactive, so labels upgrade live).
  watch(
    () => currentProfile.value?.documentId,
    (id) => {
      if (id) void loadRoCrate(id).catch(() => undefined)
    },
    { immediate: true },
  )

  const presentation = computed(() =>
    presentCrate(currentCrate.value, {
      excludeIds: contextualExclude.value,
      profile: currentProfile.value?.entityRules ?? [],
    }),
  )

  // Cross-section entity jump with a transient highlight ring; sections expand
  // their capped lists when the target is hidden behind a cap.
  const highlightId = ref('')
  let highlightTimer: number | undefined
  function jumpEntity(id: string) {
    highlightId.value = id
    void nextTick(() => {
      document.getElementById(`ctx-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      window.clearTimeout(highlightTimer)
      highlightTimer = window.setTimeout(() => (highlightId.value = ''), 1800)
    })
  }
  watch(detailId, () => (highlightId.value = ''))

  // While the displayed run is still executing, silently re-fetch its crate so
  // provenance grows live (no loading flag: the article must not flicker).
  const runActive = computed(() => {
    const run = runProvenance.value
    if (!run) return false
    return run.actionStatus !== 'CompletedActionStatus' && run.actionStatus !== 'FailedActionStatus'
  })
  const crateVisibility = useDocumentVisibility()
  useIntervalFn(() => {
    if (crateVisibility.value !== 'visible') return
    if (!runActive.value || !detailId.value || loadingCrate.value) return
    void loadRoCrate(detailId.value).catch(() => undefined)
  }, 12_000)

  return {
    cratePending,
    detailId,
    docState,
    docError,
    resolvingDoc,
    acceptedPreparing,
    fetchedSummary,
    resolveDoc,
    loadingCrate,
    crateNotReady,
    crateError,
    fetchCrate,
    current,
    currentCrate,
    crateHasEntities,
    currentProfile,
    conformsIris,
    conformsTitle,
    profileName,
    profileShortName,
    currentPath,
    canWrite,
    watchPathPrefix,
    subcrateIris,
    projectCrate,
    runProvenance,
    licenseLabel,
    presentation,
    highlightId,
    jumpEntity,
    offlineShown,
    offlineSelected,
    offlineBusy,
    setOffline,
  }
}

export type DatasetViewState = ReturnType<typeof useDatasetView>
