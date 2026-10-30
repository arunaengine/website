<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Notice from '@/components/ui/Notice.vue'
import StatusMark from '@/components/ui/StatusMark.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import DetailsSection from '@/components/metadata/DetailsSection.vue'
import PeopleSection from '@/components/metadata/PeopleSection.vue'
import ContextSection from '@/components/metadata/ContextSection.vue'
import CrateImportExport from '@/components/metadata/CrateImportExport.vue'
import CrateTransferDialog from '@/components/metadata/CrateTransferDialog.vue'
import SubcratesSection from '@/components/metadata/SubcratesSection.vue'
import PersistentIdSection from '@/components/metadata/PersistentIdSection.vue'
import RunProvenancePanel from '@/components/metadata/RunProvenancePanel.vue'
import RepositoryLinksSection from '@/components/metadata/view/RepositoryLinksSection.vue'
import RepositoryPublishDialog from '@/components/metadata/view/RepositoryPublishDialog.vue'
import PublishedDialog from '@/components/metadata/view/PublishedDialog.vue'
import DatasetActions from '@/components/metadata/view/DatasetActions.vue'
import DatasetDetailSkeleton from '@/components/metadata/view/DatasetDetailSkeleton.vue'
import DatasetFiles from '@/components/metadata/view/DatasetFiles.vue'
import DatasetGraph from '@/components/metadata/view/DatasetGraph.vue'
import DatasetProvenance from '@/components/metadata/view/DatasetProvenance.vue'
import AuthorChips from '@/components/metadata/AuthorChips.vue'
import ProfileChip from '@/components/metadata/ProfileChip.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import DatasetGitRow from '@/components/metadata/view/DatasetGitRow.vue'
import DatasetStorageRow from '@/components/metadata/view/DatasetStorageRow.vue'
import DatasetRelated from '@/components/metadata/view/DatasetRelated.vue'
import DatasetHistory from '@/components/metadata/history/DatasetHistory.vue'
import PreviewPane from '@/components/preview/PreviewPane.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import DataEntityDialog from '@/components/metadata/DataEntityDialog.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { createReusableTemplate } from '@vueuse/core'
import { useRouter, RouterLink } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useDatasetView } from '@/composables/useDatasetView'
import { useDatasetHistory } from '@/composables/useDatasetHistory'
import { useRouteTab } from '@/composables/useRouteTab'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { providePageContext } from '@/composables/usePageContext'
import { useFirstPaint } from '@/composables/useFirstPaint'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { datasetPurposeOf } from '@/lib/datasetPurpose'
import { resultsFolder, runDuration, runState } from '@/lib/runCrate'
import { folderRoute, parseDataIdentity } from '@/lib/crate/dataIdentity'
import { useS3 } from '@/composables/useS3'
import { type MetadataDocumentSummary, type RepositoryLink, type StorageLocation } from '@/lib/api'
import { publishedLinks } from '@/lib/repository'
import { errorMessage, isHttpUrl, relativeTime, truncateMiddle } from '@/lib/utils'
import { ArrowLeft, Clock, Code2, Container, GitBranch, History as HistoryIcon, LayoutDashboard, Scale, Server, Timer, Users } from '@lucide/vue'

const router = useRouter()
// The developer details sit inside a run record's What ran card and below any other dataset.
const [DefineDevelopers, ReuseDevelopers] = createReusableTemplate()
const { currentUser, saving, deleteMetadataDocument, fullCrates, sessionEpoch, myGroups } = useAruna()
// The breadcrumb names a group the reader belongs to; another group keeps its short id.
const groupLabel = (id: string) => myGroups.value.find((group) => group.id === id)?.name ?? truncateMiddle(id)
const { shown } = usePortalFeatures()

const state = useDatasetView()
const {
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
  currentProfile,
  profileName,
  currentPath,
  canWrite,
  subcrateIris,
  runProvenance,
  presentation,
  highlightId,
  jumpEntity,
  licenseLabel,
  projectCrate,
} = state
const { displayName, isLocalNode } = useRealmNodes()

// One header for the dataset: its kind, a run's state and where it ran, and a line of facts.
const KIND = { 'process-run': 'Run record', profile: 'Profile', dataset: 'Dataset', unknown: 'Dataset' } as const
const KINDS = { 'process-run': 'Run records', profile: 'Profiles', dataset: 'Datasets', unknown: 'Datasets' } as const
const purpose = computed(() => datasetPurposeOf(current.value))
const groupId = computed(() => current.value?.realmId || fetchedSummary.value?.group_id || '')
const groupMember = computed(() => myGroups.value.some((group) => group.id === groupId.value))
const runStateLabel = computed(() => {
  const value = runProvenance.value ? runState(runProvenance.value) : null
  if (value === 'succeeded') return 'Completed'
  if (value === 'failed') return 'Failed'
  return value
})
const runTool = computed(() => runProvenance.value?.instrument?.name || runProvenance.value?.container?.name || '')
const pageTitle = computed(() => current.value?.title || fetchedSummary.value?.document_path || 'Dataset')
// Datasets, then the kind's own list where it has one, then this page.
const crumbs = computed(() => {
  if (!current.value) return []
  const kind = purpose.value === 'process-run'
    ? [{ label: 'Run records', to: { name: 'datasets', query: { tab: 'records' } } }]
    : purpose.value === 'profile' ? [{ label: KINDS.profile, to: { name: 'profiles' } }] : []
  return [...kind, { label: pageTitle.value }]
})
// Show results opens the results folder in the record's group, on the node that holds it, with only
// this run's files. An output without a node in its id was written where the run ran.
const { endpoint: s3Endpoint } = useS3()
const runResults = computed(() => {
  const run = runProvenance.value
  const folder = run ? resultsFolder(run, s3Endpoint.value) : null
  if (!run || !folder) return null
  const route = folderRoute(folder.bucket, folder.prefix, groupId.value)
  const node = parseDataIdentity(run.outputs[0], s3Endpoint.value).arn?.nodeId ?? run.site?.nodeId
  return { ...route, query: { ...route.query, ...(isLocalNode(node) ? {} : { node }), ...(run.runId ? { run: run.runId } : {}) } }
})
// The record's own card in its provenance: its results, their folder and where the run ran.
const runRecord = computed(() => {
  const run = runProvenance.value
  if (!run?.outputs.length) return null
  const folder = resultsFolder(run, s3Endpoint.value)
  const path = folder ? `${folder.bucket}/${folder.prefix ? `${folder.prefix}/` : ''}` : ''
  const where = run.site?.nodeId ? displayName(run.site.nodeId) : ''
  return { files: run.outputs.length, path, to: runResults.value, runId: run.runId, where }
})

// The page paints once the registry entry and the crate have both answered;
// a save or a provenance poll later refreshes in place.
const painted = useFirstPaint(
  () => docState.value !== 'loading' && !(docState.value === 'found' && loadingCrate.value),
  () => detailId.value,
)

providePageContext(() => {
  const summary = fetchedSummary.value
  const doc = current.value
  if (!summary && !doc) return null
  const graph = (currentCrate.value as { '@graph'?: unknown[] })?.['@graph']
  return {
    kind: 'dataset',
    title: doc?.title ?? summary?.document_path ?? '',
    details: {
      'document id': summary?.document_id ?? doc?.ulid ?? '',
      path: currentPath.value,
      group: summary?.group_id ?? doc?.realmId ?? '',
      profile: profileName.value,
      visibility: summary ? (summary.public ? 'public' : 'private') : '',
      entities: Array.isArray(graph) ? String(graph.length) : '',
    },
  }
})

// The graph now sits in "For developers"; an old link to its tab opens that section, also on a
// query change or Back, which reuse this page.
const routeTab = useRouteTab(['overview', 'graph', 'provenance', 'history'], 'overview')
const developersOpen = ref(false)
watch(routeTab, (value) => value === 'graph' && (developersOpen.value = true), { immediate: true })
const history = useDatasetHistory(
  detailId,
  () => docState.value === 'found' && Boolean(currentUser.value),
  () => routeTab.value === 'history',
)
const historySupported = history.supported
// History needs a signed-in reader and a node with the versions routes.
const historyShown = computed(() => Boolean(currentUser.value) && historySupported.value !== false)
const tab = computed({
  get: () => ((routeTab.value === 'history' && !historyShown.value) || routeTab.value === 'graph' ? 'overview' : routeTab.value),
  set: (next: string) => (routeTab.value = next),
})
const showCrateExport = ref(false)
const showPublish = ref(false)
const repositoryLinks = ref<InstanceType<typeof RepositoryLinksSection> | null>(null)
const pidSection = ref<InstanceType<typeof PersistentIdSection> | null>(null)
// The Repositories section loads the links; null means unknown.
const repositoryList = ref<RepositoryLink[] | null>(null)
watch([detailId, sessionEpoch], () => (repositoryList.value = null))
const published = computed(() => publishedLinks(repositoryList.value))
const showPublished = ref(false)

async function manageRepositories() {
  showPublished.value = false
  tab.value = 'overview'
  await nextTick()
  repositoryLinks.value?.$el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}
// A storage location saved here, so the Git row does not show its cached one.
const changedStorage = ref<StorageLocation | null>(null)
watch([detailId, sessionEpoch], () => (changedStorage.value = null))
const showDelete = ref(false)
const deleteError = ref<string | null>(null)

async function confirmDelete() {
  if (!current.value) return
  deleteError.value = null
  try {
    await deleteMetadataDocument(current.value.ulid)
    showDelete.value = false
    router.push({ name: 'datasets' })
  } catch (err) {
    deleteError.value = errorMessage(err)
  }
}

async function onSaved(summary?: MetadataDocumentSummary) {
  if (summary) fetchedSummary.value = summary
  await fetchCrate(detailId.value)
}

// Header import and raw view both drive the crate section's own panel, inside "For developers".
const crateSection = ref<InstanceType<typeof CrateImportExport> | null>(null)
async function openCrate(part: 'openImport' | 'openRaw') {
  tab.value = 'overview'
  developersOpen.value = true
  await nextTick()
  crateSection.value?.[part]()
}

const infoEntityId = ref('')
const infoOpen = ref(false)
const previewOpen = ref(false)
const previewTarget = ref<{ bucket: string; key: string; name: string; size?: number; contentType?: string } | null>(null)

function openPreview(target: { bucket: string; key: string; name: string; size?: number; contentType?: string }) {
  previewTarget.value = target
  previewOpen.value = true
}

function openInfo(entityId: string) {
  infoEntityId.value = entityId
  infoOpen.value = true
}

// A jump lands on an overview section, so the overview has to be showing.
function jumpTo(entityId: string) {
  tab.value = 'overview'
  jumpEntity(entityId)
}
</script>

<template>
  <!-- Id, persistent link, Git, SPARQL, storage, graph and the raw crate, folded away. -->
  <DefineDevelopers>
    <details
      :class="runProvenance ? '-mx-5 -mb-5 border-t border-border-subtle' : 'surface overflow-hidden'"
      :open="developersOpen"
      @toggle="developersOpen = ($event.target as HTMLDetailsElement).open"
    >
      <summary class="flex cursor-pointer items-center gap-2 px-5 py-3.5 text-sm font-medium text-foreground">
        <Code2 class="h-4 w-4 text-primary" /> For developers
      </summary>
      <div class="space-y-4 border-t border-border p-5">
        <p class="flex items-center gap-2 text-xs">
          <span class="text-muted-foreground">Id</span>
          <span class="font-mono">{{ detailId }}</span>
          <CopyButton :value="detailId" label="Copy the dataset id" />
        </p>
        <PersistentIdSection
          v-if="fetchedSummary"
          ref="pidSection"
          :document-id="detailId"
          :is-public="fetchedSummary.public"
          :links="repositoryList"
        />
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-medium text-foreground">Query this dataset</h3>
            <p class="mt-1 text-xs text-muted-foreground">Open the SPARQL workbench with this dataset fixed.</p>
          </div>
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: 'datasets', query: { expert: '1', document: detailId } }"><Code2 class="h-3.5 w-3.5" /> Query this dataset</RouterLink>
          </Button>
        </div>
        <DatasetGitRow v-if="currentUser" :document-id="detailId" :group-id="fetchedSummary?.group_id" :changed="changedStorage" />
        <DatasetStorageRow
          v-if="currentUser && fetchedSummary"
          :document-id="detailId"
          :group-id="fetchedSummary.group_id"
          :can-write="canWrite"
          @changed="(value: StorageLocation) => (changedStorage = value)"
        />
        <template v-if="runProvenance">
          <DetailsSection
            :fields="presentation.fields"
            :loading="loadingCrate"
            :preparing="Boolean(cratePending[detailId])"
            :not-ready="crateNotReady"
            :error="crateError"
            @retry="fetchCrate(detailId)"
            @jump="jumpEntity"
          />
          <PeopleSection
            :people="presentation.people"
            :organizations="presentation.organizations"
            :highlight-id="highlightId"
            @jump="jumpEntity"
          />
          <ContextSection
            :entities="presentation.entities"
            :comments="presentation.comments"
            :highlight-id="highlightId"
            @jump="jumpEntity"
          />
        </template>
        <DatasetGraph v-if="developersOpen" :state="state" @open="openInfo" />
        <CrateImportExport
          ref="crateSection"
          :crate="currentCrate"
          :document-id="detailId"
          :can-import="canWrite"
          @imported="onSaved"
        />
      </div>
    </details>
  </DefineDevelopers>
  <div>
    <PageHeader
      :title="pageTitle"
      :crumbs="crumbs"
      :docs="{ topic: 'datasets', section: 'The bundle is an RO-Crate' }"
    >
      <template #title>
        <span class="inline-flex flex-wrap items-center gap-2">
          {{ pageTitle }}
          <template v-if="runProvenance">
            <StatusMark v-if="runState(runProvenance) === 'succeeded'" label="Completed" />
            <StatusPill v-else-if="runStateLabel" :state="runStateLabel" />
          </template>
          <Badge v-else-if="current" variant="royal">{{ KIND[purpose] }}</Badge>
          <Badge v-if="projectCrate" variant="outline">Project dataset</Badge>
          <button v-if="published.length" type="button" class="rounded-full" aria-label="Published. Show where this dataset is published" @click="showPublished = true">
            <Badge variant="success" class="cursor-pointer hover:opacity-80">Published</Badge>
          </button>
        </span>
      </template>
      <template v-if="current || fetchedSummary" #description>
        <!-- A run record: one row of icon facts, each linked to its page where one exists. -->
        <span v-if="runProvenance" class="flex flex-wrap gap-x-4 gap-y-1 [&>*]:inline-flex [&>*]:items-center [&>*]:gap-1.5">
          <span v-if="runTool"><Container class="h-3.5 w-3.5" aria-hidden="true" />{{ runTool }}</span>
          <RouterLink v-if="runProvenance.site?.nodeId" :to="{ name: 'node', params: { nodeId: runProvenance.site.nodeId } }" class="text-primary hover:underline">
            <Server class="h-3.5 w-3.5" aria-hidden="true" />{{ displayName(runProvenance.site.nodeId) }}
          </RouterLink>
          <span v-if="runDuration(runProvenance)" class="tabular-nums"><Timer class="h-3.5 w-3.5" aria-hidden="true" />{{ runDuration(runProvenance) }}</span>
          <RouterLink v-if="groupId && groupMember" :to="{ name: 'group', params: { id: groupId } }" class="text-primary hover:underline"><Users class="h-3.5 w-3.5" aria-hidden="true" />{{ groupLabel(groupId) }}</RouterLink>
          <span v-else-if="groupId" :title="groupId"><Users class="h-3.5 w-3.5" aria-hidden="true" />{{ groupLabel(groupId) }}</span>
          <a v-if="current?.license && isHttpUrl(current.license)" :href="current.license" target="_blank" rel="noopener noreferrer" class="hover:text-foreground hover:underline" :title="current.license"><Scale class="h-3.5 w-3.5" aria-hidden="true" />{{ licenseLabel }}</a>
          <span v-else-if="current?.license"><Scale class="h-3.5 w-3.5" aria-hidden="true" />{{ licenseLabel }}</span>
          <span v-if="current" :title="current.updatedAt"><Clock class="h-3.5 w-3.5" aria-hidden="true" />Updated {{ relativeTime(current.updatedAt) }}</span>
        </span>
        <template v-else>
          <span v-if="current?.description" class="line-clamp-2 block">{{ current.description }}</span>
          <span class="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <span v-if="groupId">Group
              <RouterLink v-if="groupMember" :to="{ name: 'group', params: { id: groupId } }" class="text-primary hover:underline">{{ groupLabel(groupId) }}</RouterLink>
              <span v-else :title="groupId">{{ groupLabel(groupId) }}</span>
            </span>
            <span v-if="current" class="inline-flex items-center gap-1.5">Profile {{ profileName }} <ProfileChip :doc="current" status-only /></span>
            <span v-if="current?.license">License
              <ExternalLink v-if="isHttpUrl(current.license)" :href="current.license" :label="licenseLabel" :title="current.license" />
              <template v-else>{{ licenseLabel }}</template>
            </span>
            <span v-if="current">Updated {{ relativeTime(current.updatedAt) }}</span>
          </span>
        </template>
      </template>
      <template #actions>
        <DatasetActions
          :state="state"
          :run="Boolean(runProvenance)"
          :results="runResults"
          @export="showCrateExport = true"
          @import="openCrate('openImport')"
          @publish="showPublish = true"
          @raw="openCrate('openRaw')"
          @delete="deleteError = null; showDelete = true"
        />
      </template>
    </PageHeader>

    <div class="w-full px-4 sm:px-6 space-y-6 py-8">
      <DatasetDetailSkeleton v-if="!painted" />

      <template v-else-if="docState === 'found'">
        <Tabs :model-value="tab" @update:model-value="(value: string) => (tab = value)">
          <TabsList aria-label="Dataset views">
            <TabsTrigger value="overview"><LayoutDashboard class="size-4" /> Overview</TabsTrigger>
            <TabsTrigger value="provenance">
              <GitBranch class="size-4" /><span class="max-sm:hidden">Where it came from</span><span class="sm:hidden">Source</span>
            </TabsTrigger>
            <TabsTrigger v-if="historyShown" value="history"><HistoryIcon class="size-4" /> History</TabsTrigger>
          </TabsList>
        </Tabs>

        <DatasetProvenance
          v-if="tab === 'provenance'"
          :state="state"
          :document-id="detailId"
          :title="current?.title || fetchedSummary?.document_path || 'Dataset'"
          :record="runRecord"
        />

        <DatasetHistory v-if="tab === 'history'" :history="history" :state="state" />

        <!-- Stays mounted on every tab: the header badge needs its links. -->
        <RepositoryLinksSection
          v-if="fetchedSummary && currentUser"
          ref="repositoryLinks"
          :class="{ hidden: tab !== 'overview' || !shown('repositories') }"
          :document-id="detailId"
          :group-id="fetchedSummary.group_id"
          :can-write="canWrite"
          @publish="showPublish = true"
          @settled="pidSection?.reload()"
          @links="(list: RepositoryLink[] | null) => (repositoryList = list)"
        />

        <template v-if="tab === 'overview'">
          <div v-if="current && !runProvenance && current.keywords.length" class="flex flex-wrap gap-1.5">
            <span v-for="keyword in current.keywords" :key="keyword" class="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/80">#{{ keyword }}</span>
          </div>
          <AuthorChips v-if="!runProvenance" :crate="currentCrate" />

          <!-- A run record keeps its developer details inside What ran; no card of their own. -->
          <RunProvenancePanel v-if="runProvenance" :run="runProvenance" :document-id="detailId" :published="current?.createdAt" @chain="tab = 'provenance'">
            <ReuseDevelopers />
          </RunProvenancePanel>

          <DetailsSection
            v-if="!runProvenance"
            :fields="presentation.fields"
            :loading="loadingCrate"
            :preparing="Boolean(cratePending[detailId])"
            :not-ready="crateNotReady"
            :error="crateError"
            @retry="fetchCrate(detailId)"
            @jump="jumpEntity"
          />

          <!-- A run record's people and context entities are technical; they wait in "For developers". -->
          <template v-if="!runProvenance">
            <PeopleSection
              :people="presentation.people"
              :organizations="presentation.organizations"
              :highlight-id="highlightId"
              @jump="jumpEntity"
            />

            <ContextSection
              :entities="presentation.entities"
              :comments="presentation.comments"
              :highlight-id="highlightId"
              @jump="jumpEntity"
            />
          </template>

          <SubcratesSection
            v-if="subcrateIris.size"
            :crate="currentCrate"
            :document-id="detailId"
            :can-write="Boolean(current) && canWrite"
          />

          <DatasetFiles v-if="!runProvenance" :state="state" @preview="openPreview" @info="openInfo" />

          <DatasetRelated :state="state" />

        </template>

        <ReuseDevelopers v-if="!runProvenance && tab === 'overview'" />
      </template>

      <EmptyState
        v-else-if="docState === 'preparing'"
        :title="acceptedPreparing ? 'Accepted, preparing dataset' : 'Dataset is still being prepared'"
        :description="detailId"
      >
        <Button variant="outline" size="sm" :disabled="resolvingDoc" @click="resolveDoc(detailId)">
          {{ resolvingDoc ? 'Checking…' : 'Retry' }}
        </Button>
      </EmptyState>

      <EmptyState
        v-else-if="docState === 'not-found'"
        title="This dataset does not exist or has been deleted."
        :description="detailId"
      >
        <Button variant="outline" as-child>
          <RouterLink :to="{ name: 'datasets' }"><ArrowLeft class="h-4 w-4" /> Datasets</RouterLink>
        </Button>
      </EmptyState>

      <EmptyState
        v-else-if="docState === 'forbidden'"
        title="This dataset is not public."
        :description="currentUser ? 'Sign in with an account that can see it.' : 'Sign in with an account that can see it, using the button in the top bar.'"
      >
        <Button variant="outline" as-child>
          <RouterLink :to="{ name: 'datasets' }"><ArrowLeft class="h-4 w-4" /> Datasets</RouterLink>
        </Button>
      </EmptyState>

      <ErrorPanel
        v-else-if="docState === 'error'"
        :message="docError ?? 'Failed to load this dataset.'"
        @retry="resolveDoc(detailId)"
      />
    </div>

    <PreviewPane
      v-if="previewTarget"
      v-model:open="previewOpen"
      :bucket="previewTarget.bucket"
      :object-key="previewTarget.key"
      :name="previewTarget.name"
      :size="previewTarget.size"
      :content-type="previewTarget.contentType"
    />

    <DataEntityDialog
      v-model:open="infoOpen"
      :crate="fullCrates[detailId] ?? current?.roCrate"
      :entity-id="infoEntityId"
      :profile="currentProfile"
      @jump="jumpTo"
    />

    <CrateTransferDialog v-model:open="showCrateExport" :document-id="detailId" :document-path="currentPath" />
    <RepositoryPublishDialog
      v-if="fetchedSummary"
      v-model:open="showPublish"
      :document-id="detailId"
      :group-id="fetchedSummary.group_id"
      @linked="repositoryLinks?.reload()"
    />
    <PublishedDialog
      v-model:open="showPublished"
      :links="published"
      :hide-manage="!shown('repositories')"
      @manage="manageRepositories"
    />

    <Dialog :open="showDelete" @update:open="(v: boolean) => (showDelete = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete dataset</DialogTitle>
          <DialogDescription>
            <span class="font-medium text-foreground">What is this?</span>
            Deletes <span class="font-medium text-foreground">{{ current?.title }}</span>
            (<span class="font-mono text-xs">{{ currentPath }}</span>) and its RO-Crate graph from datasets. Referenced S3 objects are not touched.
            <RouterLink
              :to="{ name: 'docs', params: { topic: 'data-and-deletion' } }"
              class="font-medium text-primary hover:underline"
            >Learn more</RouterLink>
          </DialogDescription>
        </DialogHeader>
        <Notice v-if="deleteError" tone="error">{{ deleteError }}</Notice>
        <DialogFooter>
          <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
          <Button variant="destructive" :disabled="saving" @click="confirmDelete">{{ saving ? 'Deleting…' : 'Delete' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
