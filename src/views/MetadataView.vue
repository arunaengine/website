<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Notice from '@/components/ui/Notice.vue'
import DetailsSection from '@/components/metadata/DetailsSection.vue'
import PeopleSection from '@/components/metadata/PeopleSection.vue'
import ContextSection from '@/components/metadata/ContextSection.vue'
import CrateImportExport from '@/components/metadata/CrateImportExport.vue'
import CrateTransferDialog from '@/components/metadata/CrateTransferDialog.vue'
import SubcratesSection from '@/components/metadata/SubcratesSection.vue'
import PersistentIdSection from '@/components/metadata/PersistentIdSection.vue'
import RunProvenancePanel from '@/components/metadata/RunProvenancePanel.vue'
import DatasetActions from '@/components/metadata/view/DatasetActions.vue'
import DatasetDetailSkeleton from '@/components/metadata/view/DatasetDetailSkeleton.vue'
import DatasetFiles from '@/components/metadata/view/DatasetFiles.vue'
import DatasetHeader from '@/components/metadata/view/DatasetHeader.vue'
import DatasetRelated from '@/components/metadata/view/DatasetRelated.vue'
import PreviewPane from '@/components/preview/PreviewPane.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DataEntityDialog from '@/components/metadata/DataEntityDialog.vue'
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useDatasetView } from '@/composables/useDatasetView'
import { useFirstPaint } from '@/composables/useFirstPaint'
import { type MetadataDocumentSummary } from '@/lib/api'
import { errorMessage, truncateMiddle } from '@/lib/utils'
import { ArrowLeft, Code2 } from '@lucide/vue'

const router = useRouter()
const { currentUser, saving, deleteMetadataDocument, fullCrates } = useAruna()

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
} = state

// The page paints once the registry entry and the crate have both answered;
// a save or a provenance poll later refreshes in place.
const painted = useFirstPaint(
  () => docState.value !== 'loading' && !(docState.value === 'found' && loadingCrate.value),
  () => detailId.value,
)

const showCrateExport = ref(false)
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

// Header import and raw view both drive the crate section's own panel.
const crateSection = ref<InstanceType<typeof CrateImportExport> | null>(null)

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
</script>

<template>
  <div>
    <PageHeader
      :title="current ? current.title : fetchedSummary ? fetchedSummary.document_path : 'Dataset'"
      :description="current ? (runProvenance ? profileName : `${profileName} · ${current.ulid}`) : fetchedSummary ? fetchedSummary.document_id : 'Live RO-Crate dataset.'"
    >
      <template #breadcrumbs>
        <template v-if="current?.realmId || fetchedSummary?.group_id">
          <span>·</span>
          <Badge
            variant="outline"
            :title="current?.realmId || fetchedSummary?.group_id"
          >Group: {{ truncateMiddle(current?.realmId || fetchedSummary?.group_id || '') }}</Badge>
        </template>
        <span>·</span>
        <span>What is this?</span>
        <RouterLink
          :to="{ name: 'docs', params: { topic: 'datasets' } }"
          class="font-medium text-primary hover:underline"
        >Learn more</RouterLink>
      </template>
      <template #actions>
        <DatasetActions
          :state="state"
          @export="showCrateExport = true"
          @import="crateSection?.openImport()"
          @raw="crateSection?.openRaw()"
          @delete="deleteError = null; showDelete = true"
        />
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <DatasetDetailSkeleton v-if="!painted" />

      <template v-else-if="docState === 'found'">
        <DatasetHeader v-if="current" :doc="current" :state="state" />

        <PersistentIdSection
          v-if="fetchedSummary"
          :document-id="detailId"
          :is-public="fetchedSummary.public"
        />

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

        <SubcratesSection
          v-if="subcrateIris.size || (Boolean(current) && canWrite)"
          :crate="currentCrate"
          :document-id="detailId"
          :can-write="Boolean(current) && canWrite"
          @changed="onSaved"
        />

        <RunProvenancePanel v-if="runProvenance" :run="runProvenance" />

        <DatasetFiles v-else :state="state" @preview="openPreview" @info="openInfo" />

        <DatasetRelated :state="state" />

        <section class="surface overflow-hidden">
          <div class="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
            <Code2 class="h-4 w-4 text-primary" /> Advanced
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <h3 class="text-sm font-medium text-foreground">Query this dataset</h3>
              <p class="mt-1 text-xs text-muted-foreground">Open the SPARQL workbench with this exact dataset scope fixed.</p>
            </div>
            <Button variant="outline" size="sm" as-child>
              <RouterLink :to="{ name: 'datasets', query: { expert: '1', document: detailId } }"><Code2 class="h-3.5 w-3.5" /> Query this dataset</RouterLink>
            </Button>
          </div>
        </section>

        <CrateImportExport
          ref="crateSection"
          :crate="currentCrate"
          :document-id="detailId"
          :can-import="canWrite"
          @imported="onSaved"
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
      @jump="jumpEntity"
    />

    <CrateTransferDialog v-model:open="showCrateExport" mode="export" :document-id="detailId" :document-path="currentPath" />

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
