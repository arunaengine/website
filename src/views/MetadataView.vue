<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Notice from '@/components/ui/Notice.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import ContextSection from '@/components/metadata/ContextSection.vue'
import CrateTypeBadge from '@/components/datasets/CrateTypeBadge.vue'
import DatasetTile from '@/components/datasets/DatasetTile.vue'
import CiteDialog from '@/components/metadata/view/CiteDialog.vue'
import ShareLinkDialog from '@/components/data/ShareLinkDialog.vue'
import CrateRuns from '@/components/metadata/view/CrateRuns.vue'
import DatasetAbout from '@/components/metadata/view/DatasetAbout.vue'
import DatasetDetails from '@/components/metadata/view/DatasetDetails.vue'
import PeoplePlaces from '@/components/metadata/view/PeoplePlaces.vue'
import CrateImportExport from '@/components/metadata/CrateImportExport.vue'
import CrateTransferDialog from '@/components/metadata/CrateTransferDialog.vue'
import SubcratesSection from '@/components/metadata/SubcratesSection.vue'
import RunProvenancePanel from '@/components/metadata/RunProvenancePanel.vue'
import RepositoryLinksSection from '@/components/metadata/view/RepositoryLinksSection.vue'
import RepositoryPublishDialog from '@/components/metadata/view/RepositoryPublishDialog.vue'
import PublishedDialog from '@/components/metadata/view/PublishedDialog.vue'
import DatasetActions from '@/components/metadata/view/DatasetActions.vue'
import DatasetDetailSkeleton from '@/components/metadata/view/DatasetDetailSkeleton.vue'
import DatasetFiles from '@/components/metadata/view/DatasetFiles.vue'
import DatasetGraph from '@/components/metadata/view/DatasetGraph.vue'
import DatasetProvenance from '@/components/metadata/view/DatasetProvenance.vue'
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
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useDatasetView } from '@/composables/useDatasetView'
import { useDatasetHistory } from '@/composables/useDatasetHistory'
import { useRouteTab } from '@/composables/useRouteTab'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { providePageContext } from '@/composables/usePageContext'
import { useFirstPaint } from '@/composables/useFirstPaint'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useUserDirectory } from '@/composables/useUserDirectory'
import { crateActions, crateTypeOf } from '@/lib/crateType'
import { aboutFacts, bylineOf, citationText } from '@/lib/datasetAbout'
import { mainAction } from '@/lib/datasetFacts'
import { crateGraph, crateRootId, stringProp } from '@/lib/dataEntities'
import { resultsFolder, runState } from '@/lib/runCrate'
import { folderRoute, parseDataIdentity } from '@/lib/crate/dataIdentity'
import { soleNode } from '@/lib/linkedPart'
import { useS3 } from '@/composables/useS3'
import { type MetadataDocumentSummary, type RepositoryLink, type ShareTarget, type StorageLocation } from '@/lib/api'
import { publishedLinks } from '@/lib/repository'
import { errorMessage } from '@/lib/utils'
import { AppWindow, ArrowLeft, Braces, GitBranch, History as HistoryIcon, LayoutDashboard, List, LogIn, Shapes, Share2 } from '@lucide/vue'

const router = useRouter()
const route = useRoute()
const { requestSignIn } = useAuth()
const { currentUser, saving, deleteMetadataDocument, fullCrates, sessionEpoch, realm } = useAruna()
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
  crateHasEntities,
  runProvenance,
  presentation,
  highlightId,
  jumpEntity,
  projectCrate,
} = state
const { displayName, isLocalNode } = useRealmNodes()

// One header for every crate: one type pill, a run's outcome, and who made it.
const crateType = computed(() => crateTypeOf(current.value))
const isRun = computed(() => crateType.value.endsWith('-run'))
const groupId = computed(() => current.value?.realmId || fetchedSummary.value?.group_id || '')
// A run still going shows its state; a finished one has the check or cross after the type pill.
const runStateLabel = computed(() => {
  const value = runProvenance.value ? runState(runProvenance.value) : null
  return value === 'succeeded' || value === 'failed' ? null : value
})
const byline = computed(() => bylineOf(currentCrate.value, isRun.value ? mainAction(currentCrate.value) : undefined))
const userDir = useUserDirectory()
watch(() => byline.value.flatMap((person) => person.userId ?? []), (ids) => {
  if (ids.length) void userDir.resolveUsers(ids)
}, { immediate: true })
// An unnamed Aruna user shows by the user's name once known, never by the raw id.
const bylineNames = computed(() => byline.value.flatMap((person) => {
  const name = person.userId ? userDir.cachedUser(person.userId)?.name : person.name
  return name ? [{ id: person.id, name }] : []
}))
const pageTitle = computed(() => current.value?.title || fetchedSummary.value?.document_path || 'Dataset')
// Datasets, then the kind's own list where it has one, then this page.
const crumbs = computed(() => {
  if (!current.value) return []
  const kind = isRun.value
    ? [{ label: 'Run records', to: { name: 'datasets', query: { type: 'process-run,workflow-run' } } }]
    : crateType.value === 'profile' ? [{ label: 'Profiles', to: { name: 'profiles' } }] : []
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

// Overview, Provenance, History and the raw JSON-LD; an old link to the graph tab opens the graph.
const routeTab = useRouteTab(['overview', 'graph', 'provenance', 'history', 'jsonld'], 'overview')
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

// The overview shows every section at once. The entities show as lists or as one graph, kept in
// `?entities=`; an old graph tab or area link opens the graph.
const facts = computed(() => aboutFacts(currentCrate.value))
const actionCount = computed(() => crateActions(currentCrate.value).length)
const routeEntities = useRouteTab(['list', 'graph'], 'list', 'entities')
const entityView = computed({
  get: () => (routeTab.value === 'graph' || route.query.seg === 'graph' ? 'graph' : routeEntities.value),
  // Only the overview offers the switch, so it also drops an old `tab` or `seg` link.
  set: (next: string) => void router.replace({ query: { ...route.query, tab: undefined, seg: undefined, entities: next === 'graph' ? next : undefined } }),
})
const entityOptions = [
  { value: 'list', label: 'List', icon: List },
  { value: 'graph', label: 'Graph', icon: Share2 },
]
const hasEntities = computed(() => {
  const view = presentation.value
  return Boolean(view.people.length + view.organizations.length + view.entities.length + view.comments.length + subcrateIris.value.size)
})
const software = computed(() => presentation.value.entities.filter((entity) => entity.kind === 'software'))
const otherEntities = computed(() => presentation.value.entities.filter((entity) => entity.kind !== 'places' && entity.kind !== 'software'))
// Short sections pair up on wide screens as equal-height cards; an empty cell takes no room.
const cell = 'flex min-w-0 flex-col empty:hidden [&>section]:flex [&>section]:flex-1 [&>section]:flex-col [&>section>.surface]:flex-1'
// A card whose partner cell is empty spans both columns, so no card stands alone at half width.
const first = 'lg:[&:has(+:empty)]:col-span-2'
const second = 'lg:[:empty+&]:col-span-2'
const showCrateExport = ref(false)
const showPublish = ref(false)
const repositoryLinks = ref<InstanceType<typeof RepositoryLinksSection> | null>(null)
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

// Header import and raw view both drive the crate section on the JSON-LD tab.
const crateSection = ref<InstanceType<typeof CrateImportExport> | null>(null)
const details = ref<InstanceType<typeof DatasetDetails> | null>(null)
async function openCrate(part: 'openImport' | 'openRaw') {
  tab.value = 'jsonld'
  await nextTick()
  crateSection.value?.[part]()
}
watch(tab, async (value) => {
  if (value !== 'jsonld') return
  await nextTick()
  crateSection.value?.openRaw()
}, { immediate: true })

// Cite: authors, year, title, publisher and the DOI, or else this page's address.
const showCite = ref(false)
const showShare = ref(false)
const shareTarget = computed<ShareTarget>(() => ({ kind: 'dataset', dataset_id: detailId.value }))
// The link is made on the node that holds the files, so a visitor can list them there.
const shareNode = computed(() => {
  const node = soleNode(crateGraph(currentCrate.value).map((entity) => String(entity['@id'])))
  return node && !isLocalNode(node) ? node : null
})
const citation = computed(() => {
  const root = crateGraph(currentCrate.value).find((entity) => entity['@id'] === crateRootId(currentCrate.value))
  const publisher = presentation.value.organizations.find((entity) => entity.roles.includes('Publisher'))?.name
  return citationText({
    authors: bylineOf(currentCrate.value).map((entry) => entry.name),
    year: (stringProp(root?.datePublished) ?? '').slice(0, 4),
    title: pageTitle.value,
    publisher: publisher ?? realm.value.shortName,
    link: facts.value.doi ?? new URL(router.resolve({ name: 'dataset', params: { id: detailId.value } }).href, window.location.origin).href,
  })
})

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

// A jump lands on an overview section, so the overview has to show the entity lists.
function jumpTo(entityId: string) {
  entityView.value = 'list'
  jumpEntity(entityId)
}
</script>

<template>
  <div>
    <PageHeader
      :title="pageTitle"
      :crumbs="crumbs"
      :docs="{ topic: 'datasets', section: 'The bundle is an RO-Crate' }"
    >
      <template #title>
        <span class="flex items-start gap-3">
          <DatasetTile v-if="current" :doc="current" size="lg" class="mt-0.5" />
          <span class="min-w-0 break-words">
            {{ pageTitle }}
            <span v-if="current || fetchedSummary" class="ml-1 inline-flex flex-wrap items-center gap-2 align-middle font-sans tracking-normal">
              <CrateTypeBadge v-if="current" :type="crateType" :crate="currentCrate" />
              <StatusPill v-if="runStateLabel" :state="runStateLabel" />
              <Badge v-if="projectCrate" variant="outline">Project dataset</Badge>
              <button v-if="published.length" type="button" class="rounded-full" aria-label="Published. Show where this dataset is published" @click="showPublished = true">
                <Badge variant="success" class="cursor-pointer hover:opacity-80">Published</Badge>
              </button>
            </span>
          </span>
        </span>
      </template>
      <template v-if="bylineNames.length" #description>
        <span class="block text-sm text-foreground">
          <template v-if="isRun">Run by </template>
          <template v-for="(person, index) in bylineNames" :key="person.id">
            <button type="button" class="inline-block max-w-[20rem] truncate align-bottom underline decoration-border underline-offset-4 hover:decoration-foreground" :title="person.name" @click="openInfo(person.id)">{{ person.name }}</button><template v-if="index < bylineNames.length - 1">, </template>
          </template>
        </span>
      </template>
      <template #actions>
        <DatasetActions
          :state="state"
          :run="isRun"
          :results="runResults"
          @cite="showCite = true"
          @share="showShare = true"
          @export="showCrateExport = true"
          @import="openCrate('openImport')"
          @publish="showPublish = true"
          @raw="openCrate('openRaw')"
          @delete="deleteError = null; showDelete = true"
        />
      </template>
    </PageHeader>

    <div class="w-full space-y-6 px-4 py-8 sm:px-6">
      <DatasetDetailSkeleton v-if="!painted" />

      <template v-else-if="docState === 'found'">
        <Tabs :model-value="tab" @update:model-value="(value: string) => (tab = value)">
          <TabsList aria-label="Dataset views" class="max-sm:h-auto max-sm:flex-wrap">
            <TabsTrigger value="overview"><LayoutDashboard class="size-4" /> Overview</TabsTrigger>
            <TabsTrigger value="provenance"><GitBranch class="size-4" /> Provenance</TabsTrigger>
            <TabsTrigger v-if="historyShown" value="history"><HistoryIcon class="size-4" /> History</TabsTrigger>
            <TabsTrigger value="jsonld"><Braces class="size-4" /> JSON-LD</TabsTrigger>
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

        <CrateImportExport
          v-if="tab === 'jsonld'"
          ref="crateSection"
          :crate="currentCrate"
          :document-id="detailId"
          :can-import="canWrite"
          @imported="onSaved"
        />

        <template v-if="tab === 'overview'">
          <DatasetAbout :state="state" @open="openInfo" @cite="showCite = true" />

          <div class="hidden gap-6 has-[>:not(:empty)]:grid lg:grid-cols-2">
            <div :class="[cell, first]"><PeoplePlaces :state="state" part="people" @open="openInfo" /></div>
            <div :class="[cell, second]"><PeoplePlaces :state="state" part="places" @open="openInfo" /></div>
          </div>

          <div v-if="runProvenance || actionCount" class="space-y-6">
            <RunProvenancePanel v-if="runProvenance" :run="runProvenance" :document-id="detailId" :published="current?.createdAt" />
            <CrateRuns
              :crate="currentCrate"
              :skip="runProvenance?.actionId"
              :title="runProvenance ? 'Other runs' : 'Runs'"
              @open="openInfo"
            />
          </div>

          <DatasetFiles :state="state" @preview="openPreview" @info="openInfo" />

          <div>
            <SectionHeading
              v-if="hasEntities || entityView === 'graph'"
              id="entities-heading"
              title="Entities"
              :icon="Shapes"
              :info="entityView === 'graph' ? 'Click a node to see its links, double-click to open it.' : undefined"
            >
              <template #actions>
                <OptionToggle
                  :model-value="entityView"
                  :options="entityOptions"
                  aria-label="Show the entities as"
                  @update:model-value="(value: string) => (entityView = value)"
                />
              </template>
            </SectionHeading>
            <div class="grid gap-6 lg:grid-cols-2">
              <template v-if="entityView === 'list'">
                <div :class="[cell, first]">
                  <SubcratesSection v-if="subcrateIris.size" :crate="currentCrate" :document-id="detailId" :can-write="Boolean(current) && canWrite" />
                </div>
                <div :class="[cell, second]"><DatasetRelated :state="state" /></div>
                <div :class="[cell, first]">
                  <ContextSection title="Software" :icon="AppWindow" :entities="software" :comments="[]" :highlight-id="highlightId" @jump="jumpEntity" />
                </div>
              </template>
              <DatasetGraph v-else :state="state" hide-heading class="lg:col-span-2" @open="openInfo" />
              <div :class="[cell, entityView === 'list' ? second : 'lg:col-span-2']">
                <DatasetDetails
                  ref="details"
                  :state="state"
                  :links="repositoryList"
                  :changed="changedStorage"
                  @changed="(value: StorageLocation) => (changedStorage = value)"
                />
              </div>
              <div v-if="entityView === 'list'" :class="[cell, 'lg:col-span-2']">
                <ContextSection :entities="otherEntities" :comments="presentation.comments" :highlight-id="highlightId" @jump="jumpEntity" />
              </div>
            </div>
          </div>
        </template>

        <!-- Stays mounted on every tab: the header badge needs its links. -->
        <RepositoryLinksSection
          v-if="fetchedSummary && currentUser"
          ref="repositoryLinks"
          :class="{ hidden: tab !== 'overview' || !shown('repositories') }"
          :document-id="detailId"
          :group-id="fetchedSummary.group_id"
          :can-write="canWrite"
          @publish="showPublish = true"
          @settled="details?.reload()"
          @links="(list: RepositoryLink[] | null) => (repositoryList = list)"
        />
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
        :title="currentUser ? 'This dataset does not exist or has been deleted.' : 'This dataset is not public, or it does not exist.'"
        :description="currentUser ? detailId : 'Sign in to see it if you have access.'"
      >
        <Button v-if="!currentUser" size="sm" @click="requestSignIn({ redirectTo: route.fullPath })"><LogIn class="h-4 w-4" /> Sign in</Button>
        <Button variant="outline" as-child>
          <RouterLink :to="{ name: 'datasets' }"><ArrowLeft class="h-4 w-4" /> Datasets</RouterLink>
        </Button>
      </EmptyState>

      <EmptyState
        v-else-if="docState === 'forbidden'"
        title="This dataset is not public"
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
      :document-id="detailId"
      @jump="jumpTo"
    />

    <CiteDialog v-model:open="showCite" :citation="citation" />
    <ShareLinkDialog v-model:open="showShare" :target="shareTarget" :node-id="shareNode" :name="current?.title ?? 'dataset'" />
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
