import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { computed, defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as DeletionOptions from '@/lib/deletion/options'
import * as DeletionRequest from '@/lib/deletion/request'
import * as ObjectVersions from '@/lib/objectVersions'
import * as Utils from '@/lib/utils'
import {
  bubbleClick,
  click,
  compileClientComponent,
  content,
  element,
  mountApp,
  nodes,
  moduleDefault,
} from '@/test/clientRender'
import { ButtonStub, Slotted, fakeManager, objectBrowser as compiledBrowser } from '@/test/dataManager'
import { exactFileBacklinkPreflight, type BacklinkPreflightResponse } from '@/lib/backlinks'
import { deletionOptions } from '@/lib/deletion/options'
import { versionStateLabel } from '@/lib/objectVersions'

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

const dataManagerSource = read('./DataManagerView.vue')
const s3ObjectsSource = read('../composables/s3/objects.ts')
const backlinksSource = read('../lib/backlinks.ts')
const stagingReferencesSource = read('../composables/useStagingReferences.ts')
const crateReferencesSource = read('../composables/useCrateReferences.ts')
const datasetReferencesSource = read('../components/data/DatasetReferencesPreflightPanel.vue')
const managerSource = read('../composables/useDataManager.ts')
const browserSelectionSource = read('../composables/useBrowserSelection.ts')
const preflightSource = read('../components/data/deletion/useDeletionPreflight.ts')
const purgeJobSource = read('../components/data/deletion/usePurgeJob.ts')
const selectionSource = read('../components/data/deletion/useSelectionDelete.ts')
const deleteDialogSource = read('../components/data/DeleteDialog.vue')
const impactSource = read('../components/data/deletion/DeletionImpact.vue')
const progressSource = read('../components/data/deletion/PurgeProgress.vue')
const outcomeSource = read('../components/data/deletion/DeletionOutcome.vue')
const objectBrowserSource = read('../components/data/manager/ObjectBrowser.vue')
const versionsSource = read('../components/data/ObjectVersionsPanel.vue')
const locationsSource = read('../components/data/ObjectLocationsPanel.vue')
const detailsSource = read('../components/data/FileDetailsDialog.vue')
const bucketSidebarSource = read('../components/data/manager/BucketSidebar.vue')

function sfc(source: string, filename: string) {
  const { descriptor } = parse(source, { filename })
  return {
    template: descriptor.template?.content ?? '',
    script: descriptor.scriptSetup?.content ?? '',
  }
}

const dataManager = sfc(dataManagerSource, 'DataManagerView.vue')
const deleteDialog = sfc(deleteDialogSource, 'DeleteDialog.vue')
const impact = sfc(impactSource, 'DeletionImpact.vue')
const progress = sfc(progressSource, 'PurgeProgress.vue')
const outcome = sfc(outcomeSource, 'DeletionOutcome.vue')
const objectBrowser = sfc(objectBrowserSource, 'ObjectBrowser.vue')
const versionsPanel = sfc(versionsSource, 'ObjectVersionsPanel.vue')
const details = sfc(detailsSource, 'FileDetailsDialog.vue')
const bucketSidebar = sfc(bucketSidebarSource, 'BucketSidebar.vue')
const datasetReferences = sfc(datasetReferencesSource, 'DatasetReferencesPreflightPanel.vue')
const datasetReferencesTemplate = datasetReferences.template

// Handles both top-level and composable-scoped (indented) declarations.
function functionSource(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`)
  const end = source.slice(start + 1).search(/\n\s*(?:async )?function /)
  return end < 0 ? source.slice(start) : source.slice(start, start + 1 + end)
}

function buttonOpeningTag(template: string, handler: string): string {
  const click = template.indexOf(`@click="${handler}"`)
  const start = template.lastIndexOf('<Button', click)
  const end = template.indexOf('>', click)
  return template.slice(start, end + 1)
}

const allowed = { canWrite: true, canPurge: true }

describe('Data Manager version-aware deletion', () => {
  it('renders the bounded preflight counts, truncation, permissions, and bucket sync side effect', () => {
    for (const label of [
      'Current heads',
      'Noncurrent versions',
      'Delete markers',
      'Open multipart uploads',
    ]) {
      expect(impactSource).toContain(label)
    }
    expect(impact.template).toContain('!props.preflight.counts.complete')
    expect(impact.template).toContain('more than shown')
    expect(impact.template).toContain('props.preflight.truncation.versions_truncated')
    expect(impact.template).toContain('props.preflight.truncation.multipart_uploads_truncated')
    expect(impact.template).toContain('props.preflight.permissions.read')
    expect(impact.template).toContain('props.preflight.permissions.purge')
    expect(impact.template).toContain('sync_relationships_apply_to_bucket_delete')
    expect(impact.template).toContain('Sync-relationship removal')
    expect(impact.template).toContain('This confirmed side effect is not a blocker.')
    expect(impact.template).not.toContain('relationship.blocker')
  })

  it('routes every permanent scope through one job and keeps partial progress visible', () => {
    expect(objectBrowser.template).toContain('Delete permanently…')
    expect(bucketSidebar.template).toContain('label="Delete bucket…"')
    expect(bucketSidebarSource).toContain("kind: 'bucket'")
    expect(purgeJobSource).toContain('startStoragePurge(')
    expect(purgeJobSource).toContain('getStoragePurgeJob(')
    expect(purgeJobSource).toContain('retainStoragePurgeProgress(')
    expect(progress.template).toContain('Committed entries from completed batches:')
    expect(progress.template).toContain('Work committed by completed batches remains deleted.')
    expect(progress.template).toContain('Remaining after refresh')
    expect(progress.template).toContain('Reusing the existing deletion for this retry.')
    expect(deleteDialog.template).toContain('Try again')
    expect(deleteDialogSource).toContain('createStoragePurgeOperation(target)')
  })

  it('keeps ordinary file and folder deletion version-less and truthfully worded', () => {
    // The marker path sends no version id; only the calls that name one do.
    expect(s3ObjectsSource).toContain('new DeleteObjectCommand({ Bucket: bucket, Key: key })')
    expect(s3ObjectsSource).toContain(
      'Delete: { Objects: keys.map((key) => ({ Key: key })), Quiet: false }',
    )
    expect(s3ObjectsSource).toContain(
      'new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId })',
    )
    const [marker] = deletionOptions({ kind: 'object', permissions: allowed, remote: false })
    expect(marker.description).toContain('every earlier version stays')
    expect(marker.description).toContain('Show deleted brings it back')
    expect(deleteDialog.template).not.toContain('ALL objects under it are permanently deleted.')
  })

  it('runs the distributed partial-tolerant reference preflight before every destructive dialog', () => {
    expect(backlinksSource).toContain("'/metadata/references/preflight'")
    expect(backlinksSource).toContain("mode: request.mode ?? 'distributed'")
    expect(backlinksSource).toContain('allow_partial: request.allow_partial ?? true')

    const load = functionSource(deleteDialog.script, 'loadBacklinks')
    expect(load).toContain("loadBulkBacklinkPreflight(")
    expect(load).toContain('loadBacklinkPreflight(target, operation, current.nodeId)')
    // The chosen outcome decides which question is asked.
    expect(deleteDialog.script).toContain("id === 'delete-permanently' || id === 'delete-bucket'")
    expect(deleteDialog.script).toContain("? 'all_versions_purge'")
    expect(deleteDialog.script).toContain(": 'latest_version_tombstone'")
  })

  it('drops a sibling-key result before a single-file preflight can render it', () => {
    const response = {
      targets: [{
        content_w3id: 'https://w3id.org/aruna/data/sibling',
        targeted_versions: [{ node_id: 'node-a', bucket: 'data', key: 'foo.bar', version_id: 'v1' }],
        visible_references: [{ document_id: 'sibling-doc', title: 'Sibling dataset' }],
        hidden_references_exist: false,
        would_remove_last_resolvable_aruna_location: true,
        location_impact_complete: true,
      }],
      next_cursor: null,
      truncated: false,
      nodes_queried: 1,
      nodes_failed: 0,
      complete: true,
      failed_partitions: [],
      coverage: {
        queried_scope: 'bucket_prefix',
        queried_forms: ['contentUrl'],
        excluded_forms: [],
        node_freshness: [{ node_id: 'node-a', index_state: 'current', oldest_status_updated_at_ms: null }],
        target_resolution_complete: true,
        path_style_endpoint_coverage_complete: true,
        realm_coverage_complete: true,
      },
    } satisfies BacklinkPreflightResponse

    const filtered = exactFileBacklinkPreflight(response, 'data', 'foo')

    expect(filtered.targets).toEqual([])
    expect(filtered.complete).toBe(false)
    expect(filtered.coverage).toMatchObject({
      target_resolution_complete: false,
      path_style_endpoint_coverage_complete: false,
      realm_coverage_complete: false,
    })
    expect(functionSource(preflightSource, 'loadBacklinkPreflight')).toContain(
      'exactFileBacklinkPreflight(response, scope.bucket, scope.key)',
    )
  })

  it('renders visible, restricted, last-location, and partial coverage warnings in all dialogs', () => {
    // One impact panel now serves every target kind, so it is mounted once.
    expect(impact.template.match(/<DatasetReferencesPreflightPanel/g)).toHaveLength(1)
    expect(deleteDialog.template).toContain('<DeletionImpact')
    expect(datasetReferencesTemplate).toContain('aria-label="Dataset references"')
    expect(datasetReferencesTemplate).not.toContain('RDF Dataset references')
    expect(datasetReferences.script).toContain("params: { id: reference.document_id }")
    expect(datasetReferences.script).toContain('text: reference.title')
    expect(datasetReferencesTemplate).toContain('Other restricted datasets reference this content')
    expect(datasetReferences.script).toContain('target.would_remove_last_resolvable_aruna_location')
    expect(datasetReferencesTemplate).toContain("This operation would remove this content's last resolvable Aruna location.")
    expect(datasetReferencesTemplate).toContain('Dataset-reference coverage is partial.')
    expect(datasetReferencesTemplate).toContain('preflight.coverage.queried_scope')
    expect(datasetReferencesTemplate).toContain('preflight.coverage.queried_forms')
    expect(datasetReferences.script).toContain('coverage.node_freshness')
    expect(datasetReferences.script).toContain('coverage.excluded_forms')
  })

  it('renders failed staging lookup as failed instead of a successful empty result', () => {
    expect(stagingReferencesSource).toContain("'unknown' | 'loading' | 'loaded' | 'error'")
    expect(stagingReferencesSource).toContain("status.value = 'error'")
    expect(stagingReferencesSource).toContain('error.value = errorMessage(caught)')
    expect(impact.template.match(/aria-label="Source bindings"/g)).toHaveLength(1)
    const sourceBindings = impact.template.slice(
      impact.template.indexOf('aria-label="Source bindings"'),
      impact.template.indexOf('</section>', impact.template.indexOf('aria-label="Source bindings"')),
    )
    expect(sourceBindings).toContain("props.sourceStatus === 'error'")
    expect(sourceBindings).toContain('Source-binding lookup failed.')
    expect(sourceBindings.indexOf('Source-binding lookup failed.')).toBeLessThan(
      sourceBindings.indexOf('No source bindings were found for this scope.'),
    )
  })

  it('keeps warnings advisory and gates only the typed name and the version', () => {
    const confirm = buttonOpeningTag(deleteDialog.template, 'confirm')
    expect(confirm).not.toContain('backlinkPreflight')
    expect(confirm).not.toContain('hidden_references_exist')
    expect(confirm).not.toContain('would_remove_last_resolvable_aruna_location')
    // The gates are the typed name and a named version, nothing else.
    expect(confirm).toContain('confirmBlocked')
    expect(deleteDialogSource).toContain('|| !typedOk.value')
    expect(deleteDialogSource).toContain("selected.value?.call.operation === 'delete-version' && !targetVersionId.value")
    expect(deleteDialog.template).toContain('to confirm')
    expect(deleteDialogSource).toContain("typedName.value.trim() === typedTarget.value")
  })

  it('keeps the cache-backed reverse index explicitly labelled as non-authoritative', () => {
    expect(crateReferencesSource).toContain("'Referenced by loaded metadata'")
    expect(crateReferencesSource).toContain('never the whole realm')
  })
})

describe('Data Manager explicit multi-file deletion', () => {
  it('keeps selection in the Data Manager listing and preserves it across refreshes', () => {
    expect(browserSelectionSource).toContain('const selectedObjectKeys = ref<Set<string>>(new Set())')
    expect(browserSelectionSource).toContain('const selectedPrefixes = ref<Set<string>>(new Set())')
    expect(objectBrowser.template).toContain('aria-label="Select all listed folders and files"')
    expect(objectBrowser.template).toContain(':checked="selectedObjectKeys.has(object.key)"')
    expect(objectBrowser.template).toContain(':checked="selectedPrefixes.has(folder.prefix)"')
    expect(objectBrowser.template).toContain('Delete selected ({{ selectedCount }})')

    expect(functionSource(managerSource, 'clearObjectListing')).toContain('selection.clearSelection()')
    expect(functionSource(managerSource, 'loadObjects')).not.toContain('clearSelection()')

    const prune = functionSource(browserSelectionSource, 'pruneSelection')
    expect(prune).toContain("scope.kind === 'bucket'")
    expect(prune).toContain('id.startsWith(scope.prefix)')
    const completed = functionSource(managerSource, 'onDeleteCompleted')
    expect(completed).toContain('selection.pruneSelection(scope)')
    expect(completed).toContain('selection.dropCommitted(done)')
  })

  it('runs one bounded selection preflight phase and renders every D5 warning class', () => {
    const preflight = functionSource(preflightSource, 'loadBulkBacklinkPreflight')
    const entries = functionSource(preflightSource, 'bulkEntries')
    const covers = functionSource(preflightSource, 'entryCovers')
    const merge = functionSource(preflightSource, 'mergeBulkBacklinkPreflights')
    expect(functionSource(deleteDialog.script, 'loadBacklinks')).toContain('keys: keys.value')
    expect(functionSource(deleteDialog.script, 'loadBacklinks')).toContain('prefixes: prefixes.value')
    expect(preflight).toContain('entries.slice(offset, offset + BULK_PREFLIGHT_CONCURRENCY)')
    expect(entries).toContain("{ kind: 'file', bucket: target.bucket, key }")
    expect(entries).toContain("{ kind: 'prefix', bucket: target.bucket, prefix }")
    expect(preflight).toContain('limit: BULK_BACKLINK_LIMIT')
    expect(covers).toContain('location.key === entry.key')
    expect(covers).toContain('location.key.startsWith(entry.key)')
    expect(merge).toContain('entryCovers(target, { key, exact })')
    expect(datasetReferencesTemplate).toContain('Dataset-reference lookup failed for part or all of the selection.')
    expect(datasetReferencesTemplate).toContain('Other restricted datasets reference this content')
    expect(datasetReferencesTemplate).toContain("This operation would remove this content's last resolvable Aruna location.")
    expect(datasetReferencesTemplate).toContain('Dataset-reference coverage is partial.')
    expect(datasetReferences.script).toContain('coverage.node_freshness')
    expect(datasetReferences.script).toContain('coverage.excluded_forms')
  })

  it('caps ordinary batches and retains exact mixed-success and transport outcomes', () => {
    const markers = functionSource(selectionSource, 'deleteMarkers')
    const retain = functionSource(selectionSource, 'record')
    expect(selectionSource).toContain('const BATCH_SIZE = 1_000')
    expect(markers).toContain('keys.slice(offset, offset + BATCH_SIZE)')
    expect(markers).toContain('Promise.allSettled(')
    expect(markers).toContain('s3.deleteObject(bucket, key, nodeId)')
    expect(markers).toContain('status: failureStatus(result.reason)')
    expect(functionSource(selectionSource, 'failureStatus')).toContain("return 'unknown'")
    expect(retain).toContain("result.status === 'committed' ? [result.key] : []")
    expect(functionSource(browserSelectionSource, 'dropCommitted')).toContain('!done.has(id)')
    expect(outcome.template).toContain('Committed entries')
    expect(outcome.template).toContain('Failed entries stay selected for review or retry.')
    expect(outcome.template).toContain('Unknown entries stay selected for review or retry.')
  })

  it('keeps folder deletion separate and offers both selected-file semantics', () => {
    const selection = deletionOptions({
      kind: 'selection',
      permissions: allowed,
      remote: false,
      selectionCount: 3,
    })
    expect(selection.map((option) => option.id)).toEqual(['delete', 'delete-permanently'])
    expect(functionSource(selectionSource, 'loadScopes')).toContain('getStorageDeletionPreflight(')
    expect(selectionSource).toContain("createStoragePurgeOperation({ kind: 'file', bucket, key })")
    expect(functionSource(selectionSource, 'purgeKeys')).toContain('runScope(')
    expect(functionSource(selectionSource, 'runScope')).toContain('startStoragePurge(')
    expect(functionSource(objectBrowser.script, 'deleteFolder')).not.toContain('selectedObjectKeys')
    // One destructive entry per row: the Bomb icon and its twin are gone.
    expect(objectBrowserSource).not.toContain('Bomb')
    expect(objectBrowser.template.match(/label="Delete…"/g)).toHaveLength(1)
    expect(objectBrowser.template.match(/label="Delete folder…"/g)).toHaveLength(1)
  })

  it('keeps new UI copy free of em dashes and the retired label namespace', () => {
    const renderedTemplate = [
      dataManager.template,
      deleteDialog.template,
      impact.template,
      progress.template,
      outcome.template,
      objectBrowser.template,
      versionsPanel.template,
      details.template,
      bucketSidebar.template,
      datasetReferencesTemplate,
    ]
      .join('\n')
      .replace(/<!--[\s\S]*?-->/g, '')
    expect(renderedTemplate).not.toContain('\u2014')
    for (const source of [
      dataManagerSource,
      managerSource,
      deleteDialogSource,
      selectionSource,
      objectBrowserSource,
      versionsSource,
      locationsSource,
    ]) {
      expect(source).not.toMatch(/aruna[.]io/)
    }
  })
})

describe('Data Manager versions and restore', () => {
  it('lists versions and markers with one badge vocabulary', () => {
    const entry = { key: 'a.txt', versionId: 'v1', isLatest: true, deleteMarker: false }
    expect(versionsSource).toContain('s3.listObjectVersions(')
    expect(versionStateLabel({ ...entry, deleteMarker: true })).toBe('Delete marker')
    expect(versionStateLabel(entry)).toBe('Current')
    expect(versionStateLabel({ ...entry, isLatest: false })).toBe('Older')
    expect(versionsPanel.template).toContain('stateVariant(versionStateLabel(entry))')
    expect(versionsPanel.template).toContain('truncateMiddle(entry.versionId, 8, 6)')
    expect(versionsPanel.template).toContain('label="Copy version id"')
  })

  it('offers only the actions a version row can perform', () => {
    // Download and Preview are hidden on a marker: it carries no bytes.
    const actions = versionsPanel.template.slice(versionsPanel.template.indexOf('<span class="flex flex-1'))
    expect(actions).toContain('v-if="!entry.deleteMarker"')
    expect(actions).toContain('label="Preview this version"')
    expect(actions).toContain('label="Download this version"')
    expect(actions).toContain(`option(entry, 'restore')`)
    expect(actions).toContain(`option(entry, 'make-current')`)
    expect(actions).toContain(`option(entry, 'delete-version')`)

    const marker = deletionOptions({ kind: 'marker', isCurrent: true, permissions: allowed, remote: false })
    expect(marker.map((option) => option.label)).toEqual(['Restore'])
    const older = deletionOptions({ kind: 'version', isCurrent: false, permissions: allowed, remote: false })
    expect(older.map((option) => option.label)).toEqual(['Make current', 'Delete this version'])
  })

  it('restores with one call to the marker version', () => {
    const restore = functionSource(versionsSource, 'restore')
    expect(restore).toContain('s3.deleteObjectVersion(props.bucket, props.objectKey, entry.versionId')
    expect(functionSource(managerSource, 'restoreObject')).toContain(
      's3.deleteObjectVersion(',
    )
    expect(functionSource(managerSource, 'restoreObject')).toContain('entry.markerVersionId')
  })

  it('keeps versions unavailable for a bucket on another node, with the reason', () => {
    expect(versionsPanel.template).toContain('<RefusalNote')
    expect(versionsSource).toContain('This bucket is served by another node.')
    expect(versionsSource).toContain('cannot be listed here')
  })

  it('lists and restores deleted keys from the browser', () => {
    expect(managerSource).toContain("const SHOW_DELETED_KEY = 'aruna.data.showDeleted'")
    expect(managerSource).toContain("readStored(SHOW_DELETED_KEY) === '1'")
    expect(functionSource(managerSource, 'setShowDeleted')).toContain('storeValue(SHOW_DELETED_KEY')
    expect(functionSource(managerSource, 'loadDeleted')).toContain('s3.listDeletedObjects(')
    expect(objectBrowser.template).toContain('Show deleted')
    expect(objectBrowser.template).toContain('showDeleted ? deletedObjects : []')
    expect(objectBrowser.template).toContain('>Deleted</Badge>')
    expect(objectBrowser.template).toContain('label="Restore"')
    // Hidden on a bucket held by another node, with the reason in its place.
    expect(objectBrowser.template).toContain('v-if="!remoteNodeId && !remoteBlocked"')
    expect(objectBrowser.template).toContain('Deleted objects are listed by the node that holds this bucket')
  })

  it('keeps the open file and its section in the route', () => {
    expect(functionSource(managerSource, 'openDetails')).toContain('object: object.key')
    expect(functionSource(managerSource, 'openDetails')).toContain('query.tab = tab')
    expect(managerSource).toContain("const DETAIL_TABS = ['general', 'preview', 'versions', 'storage']")
    // Preview is a mode of the same dialog, so it is not one of the tabs.
    expect(details.template).toContain('<TabsTrigger value="general">General</TabsTrigger>')
    expect(details.template).toContain('<TabsTrigger value="versions">Versions</TabsTrigger>')
    expect(details.template).toContain('<TabsTrigger value="storage">Storage</TabsTrigger>')
    expect(details.template).not.toContain('<TabsTrigger value="preview">')
    expect(details.template).toContain("previewMode ? 'general' : 'preview'")
  })

  it('asks the locations endpoint about the selected version', () => {
    expect(locationsSource).toContain(
      'getBlobLocations(props.bucket, props.objectKey, props.versionId ?? undefined)',
    )
    expect(details.template).toContain(':version-id="pinnedVersion"')
    expect(locationsSource).toContain('props.versionId')
  })

  it('labels every icon-only control in the browser', () => {
    // Every icon-size Button in the browser is an IconButton, which renders the
    // one label as both the accessible name and the hover tooltip.
    expect(objectBrowser.template).not.toMatch(/<Button[^>]*size="icon-sm"/)
    for (const match of objectBrowser.template.matchAll(/<IconButton[\s\S]*?>/g)) {
      expect(match[0]).toMatch(/label="/)
    }
  })
})

// One mounted pass through the real controls: the row action hands its target
// to the one dialog, the dialog writes exactly that call and closes.
const deleteObject = vi.fn(async () => undefined)
const deleteDialogComponent = compileClientComponent(
  new URL('../components/data/DeleteDialog.vue', import.meta.url),
  {
    vue: VueRuntime,
    '@/lib/utils': Utils,
    '@/lib/deletion/options': DeletionOptions,
    '@/lib/deletion/request': DeletionRequest,
    '@/lib/objectVersions': ObjectVersions,
    '@/lib/storageDeletion': {
      createStoragePurgeOperation: (scope: unknown) => ({ scope, idempotencyKey: 'key' }),
      getStorageDeletionPreflight: vi.fn(async () => {
        throw new Error('no preflight in this test')
      }),
      isStorageDeletionNotFound: () => false,
      storageDeletionErrorMessage: (error: unknown) => String(error),
    },
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/Dialog.vue': moduleDefault(
      defineComponent({
        props: { open: Boolean },
        setup: (props, { slots }) => () => (props.open ? h('div', slots.default?.()) : null),
      }),
    ),
    '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
    '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
    '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('footer')),
    '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
    '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
    '@/components/ui/Input.vue': moduleDefault(Slotted('input')),
    '@/components/ui/RefusalNote.vue': moduleDefault(
      defineComponent({ props: { message: String, tone: String }, setup: (props) => () => h('aside', props.message) }),
    ),
    '@/components/data/deletion/DeletionImpact.vue': moduleDefault(Slotted('section')),
    '@/components/data/deletion/DeletionOutcome.vue': moduleDefault(Slotted('section')),
    '@/components/data/deletion/PurgeProgress.vue': moduleDefault(Slotted('section')),
    '@/components/data/deletion/VersionPicker.vue': moduleDefault(Slotted('section')),
    '@/components/data/deletion/useDeletionPreflight': {
      useDeletionPreflight: () => ({
        backlinkPreflight: ref(null),
        backlinkPreflightBusy: ref(false),
        backlinkPreflightError: ref(null),
        permanentDeleteApiBase: () => null,
        resetBacklinkPreflightState: () => {},
        loadBacklinkPreflight: async () => {},
        loadBulkBacklinkPreflight: async () => {},
      }),
    },
    '@/components/data/deletion/usePurgeJob': {
      usePurgeJob: () => ({
        submission: ref(null),
        status: ref(null),
        progress: ref(null),
        reset: () => {},
        run: vi.fn(),
      }),
    },
    '@/components/data/deletion/useSelectionDelete': {
      useSelectionDelete: () => ({
        outcome: ref(null),
        scopes: ref([]),
        scopesBusy: ref(false),
        inventory: computed(() => ({
          current_heads: 0,
          noncurrent_versions: 0,
          delete_markers: 0,
          open_multipart_uploads: 0,
          complete: true,
        })),
        scopeErrors: computed(() => []),
        deniedKeys: computed(() => []),
        purgeReady: () => true,
        pendingKeys: (keys: string[]) => keys,
        reset: () => {},
        loadScopes: async () => {},
        deleteMarkers: async () => {},
        purgeKeys: async () => {},
      }),
    },
    '@/composables/useAruna': { useAruna: () => ({ authToken: ref('token') }) },
    '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => id }) },
    '@/composables/useStagingReferences': {
      useStagingReferences: () => ({ entries: ref([]), status: ref('loaded'), error: ref(null) }),
    },
    '@/composables/useS3': {
      s3ErrorMessage: (error: unknown) => String(error),
      useS3: () => ({
        canWrite: () => true,
        canDeletePrefix: () => true,
        listObjectVersions: vi.fn(),
        deleteObject,
        deletePrefix: vi.fn(),
        deleteObjectVersion: vi.fn(),
        copyObjectVersion: vi.fn(),
        deleteBucket: vi.fn(),
      }),
    },
  },
)

describe('Data Manager deletion from the object row', () => {
  it('writes the marker the row asked for and closes the dialog', async () => {
    deleteObject.mockClear()
    const request = ref<DeletionRequest.DeleteRequest | null>(null)
    const host = defineComponent({
      setup: () => () =>
        h('div', [
          h(compiledBrowser(), {
            manager: fakeManager({
              requestDelete: (target: DeletionRequest.DeleteRequest) => (request.value = target),
            }),
          }),
          h(deleteDialogComponent, {
            request: request.value,
            onClose: () => (request.value = null),
          }),
        ]),
    })
    const { root } = await mountApp(host)

    await bubbleClick(element(root, (node) => node.props['aria-label'] === 'Delete…'))
    expect(content(root)).toContain('reef/raw/reads.fastq')

    const confirm = element(
      root,
      (node) => node.tag === 'button' && content(node).trim() === 'Delete',
    )
    await click(confirm)

    expect(deleteObject).toHaveBeenCalledWith('reef', 'raw/reads.fastq', null)
    expect(request.value).toBeNull()
  })
})
