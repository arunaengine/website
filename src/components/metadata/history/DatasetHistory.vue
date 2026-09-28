<script setup lang="ts">
// The History tab: kept conflicts, one branch selector and the version list of
// the selected branch. main is the live metadata; drafts merge into it.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import ListSkeleton from '@/components/ui/ListSkeleton.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import ConfirmAction from './ConfirmAction.vue'
import NameDialog from './NameDialog.vue'
import VersionCompare from './VersionCompare.vue'
import VersionCrate from './VersionCrate.vue'
import VersionMerge from './VersionMerge.vue'
import VersionRow from './VersionRow.vue'
import type { DatasetHistoryState } from '@/composables/useDatasetHistory'
import type { DatasetViewState } from '@/composables/useDatasetView'
import {
  deleteBranch,
  deleteTag,
  discardConflict,
  mergeBranch,
  mergeConflict,
  type DatasetVersion,
  type VersionConflict,
} from '@/lib/api'
import { branchLabel, shortVersion } from '@/lib/versions'
import { relativeTime } from '@/lib/utils'
import { GitCompare, GitMerge, Plus, Trash2 } from '@lucide/vue'

const props = defineProps<{ history: DatasetHistoryState; state: DatasetViewState }>()
const { branches, tags, conflicts, branch, selected, isDraft, versions, nextCursor, loadingMore, moreError } = props.history
const { canWrite } = props.state

const branchOptions = computed(() => {
  const options = (branches.value ?? []).map((entry) => ({ value: entry.name, label: branchLabel(entry) }))
  if (!options.some((option) => option.value === branch.value)) options.unshift({ value: branch.value, label: branch.value })
  return options
})

function absolute(iso: string): string {
  return new Date(iso).toLocaleString()
}

// After a write the list starts again from the first page; main also feeds Overview.
async function afterWrite(liveChanged = false) {
  await props.history.refresh()
  if (liveChanged) await props.state.fetchCrate(props.history.documentId.value)
}

const compareOpen = ref(false)
const compareFrom = ref('')
const compareTo = ref('main')
function openCompare(from: string, to: string) {
  compareFrom.value = from
  compareTo.value = to
  compareOpen.value = true
}
function compareBranch() {
  openCompare(isDraft.value ? 'main' : selected.value?.head.parents[0] ?? '', branch.value)
}

const nameOpen = ref(false)
const nameKind = ref<'branch' | 'tag'>('branch')
const nameSource = ref('main')
function openName(kind: 'branch' | 'tag', source: string) {
  nameKind.value = kind
  nameSource.value = source
  nameOpen.value = true
}
async function created(name: string) {
  if (nameKind.value === 'branch') branch.value = name
  await afterWrite()
}

const crateOpen = ref(false)
const crateVersion = ref('')
function openCrate(version: DatasetVersion) {
  crateVersion.value = version.version
  crateOpen.value = true
}

interface MergePlan {
  source: string
  target: string
  withMessage: boolean
  run: (message: string | undefined) => Promise<unknown>
}
const mergeOpen = ref(false)
const merge = ref<MergePlan | null>(null)
function openMerge(plan: MergePlan) {
  merge.value = plan
  mergeOpen.value = true
}
function mergeDraft() {
  const name = branch.value
  openMerge({
    source: name,
    target: 'main',
    withMessage: true,
    run: (message) =>
      mergeBranch(props.history.documentId.value, name, { into: 'main', message }, props.history.headOf('main'), props.history.client()),
  })
}
function mergeKept(conflict: VersionConflict) {
  const target = conflict.branch ?? 'main'
  openMerge({
    source: shortVersion(conflict.version.version),
    target,
    withMessage: false,
    run: () => mergeConflict(props.history.documentId.value, conflict.id, props.history.headOf(target), props.history.client()),
  })
}

interface ConfirmPlan {
  title: string
  description: string
  action: string
  run: () => Promise<unknown>
  done: () => void | Promise<void>
}
const confirmOpen = ref(false)
const confirm = ref<ConfirmPlan | null>(null)
function openConfirm(plan: ConfirmPlan) {
  confirm.value = plan
  confirmOpen.value = true
}
function deleteDraft() {
  const current = selected.value
  if (!current || current.protected) return
  openConfirm({
    title: 'Delete draft',
    description: `Deletes the branch ${current.name}. Its versions stay only where other branches or tags contain them.`,
    action: 'Delete',
    run: () => deleteBranch(props.history.documentId.value, current.name, current.version, props.history.client()),
    done: async () => {
      branch.value = 'main'
      await afterWrite()
    },
  })
}
function removeTag(version: DatasetVersion, name: string) {
  const tag = tags.value.find((entry) => entry.name === name) ?? { name, version: version.version }
  openConfirm({
    title: 'Remove tag',
    description: `Removes the tag ${name}. The version itself stays.`,
    action: 'Remove',
    run: () => deleteTag(props.history.documentId.value, tag, props.history.client()),
    done: () => afterWrite(),
  })
}
function discardKept(conflict: VersionConflict) {
  openConfirm({
    title: 'Discard change',
    description: `Discards the change by ${props.history.author(conflict.version)} that did not apply. This cannot be undone.`,
    action: 'Discard',
    run: () => discardConflict(props.history.documentId.value, conflict.id, props.history.client()),
    done: () => afterWrite(),
  })
}
</script>

<template>
  <div class="space-y-3">
    <Notice v-for="conflict in conflicts" :key="conflict.id" tone="warning">
      <div class="flex flex-wrap items-center gap-2">
        <span class="min-w-0 flex-1">
          A change to
          <span class="font-mono">{{ conflict.branch ?? `tag ${conflict.tag}` }}</span>
          by {{ history.author(conflict.version) }}
          <Tooltip :label="absolute(conflict.version.created_at)"><span>{{ relativeTime(conflict.version.created_at) }}</span></Tooltip>
          did not apply because another node saved at the same time.
        </span>
        <Button v-if="conflict.branch" variant="ghost" size="sm" @click="openCompare(conflict.branch, conflict.version.version)">Compare</Button>
        <Button v-if="conflict.branch && canWrite" variant="ghost" size="sm" @click="mergeKept(conflict)">Merge</Button>
        <Button v-if="canWrite" variant="ghost" size="sm" class="text-destructive" @click="discardKept(conflict)">Discard</Button>
      </div>
    </Notice>

    <section class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <Select v-model="branch" :options="branchOptions" aria-label="Branch" label="Branch" class="w-72" />
        <Button v-if="canWrite" variant="outline" @click="openName('branch', branch)"><Plus class="h-4 w-4" /> New branch</Button>
        <Button variant="ghost" class="ml-auto text-muted-foreground" :disabled="!selected" @click="compareBranch">
          <GitCompare class="h-4 w-4" /> Compare
        </Button>
      </div>

      <div v-if="isDraft" class="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <span class="min-w-0 flex-1">Draft branch. Its changes do not affect the live metadata until they are merged into main.</span>
        <template v-if="canWrite">
          <Button size="sm" @click="mergeDraft"><GitMerge class="h-3.5 w-3.5" /> Merge into main</Button>
          <Button variant="ghost" size="sm" class="text-destructive" @click="deleteDraft"><Trash2 class="h-3.5 w-3.5" /> Delete</Button>
        </template>
      </div>

      <ListSkeleton v-if="history.state.value === 'loading'" label="Loading versions" />
      <EmptyState v-else-if="history.state.value === 'missing'" title="No versions yet" description="Versions appear here once the dataset's metadata is saved." />
      <EmptyState
        v-else-if="history.state.value === 'not-holder'"
        title="History is not available on this node"
        description="Another node holds this dataset's history."
      />
      <EmptyState v-else-if="history.state.value === 'forbidden'" title="You cannot see the history of this dataset." />
      <ErrorPanel
        v-else-if="history.state.value !== 'ready'"
        :message="history.problemMessage.value || 'Failed to load the history.'"
        @retry="history.refresh()"
      />
      <EmptyState v-else-if="!versions?.length" :title="isDraft ? 'No changes on this draft yet' : 'No versions yet'" />
      <template v-else>
        <ul class="surface divide-y divide-border overflow-hidden">
          <VersionRow
            v-for="version in versions"
            :key="version.version"
            :version="version"
            :author="history.author(version)"
            :can-write="canWrite"
            @open="openCompare(version.parents[0] ?? '', version.version)"
            @compare="openCompare(version.version, 'main')"
            @crate="openCrate(version)"
            @tag="openName('tag', version.version)"
            @branch="openName('branch', version.version)"
            @untag="(name: string) => removeTag(version, name)"
          />
        </ul>
        <div v-if="nextCursor || moreError" class="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" :disabled="loadingMore" @click="history.loadMore()">
            {{ loadingMore ? 'Loading…' : 'Load older versions' }}
          </Button>
          <Notice v-if="moreError" tone="error">{{ moreError }}</Notice>
        </div>
        <p v-if="isDraft && !nextCursor" class="text-xs text-muted-foreground">
          Older versions are shared with main. Switch to main to see them.
        </p>
      </template>
    </section>

    <VersionCompare v-if="compareOpen" v-model:open="compareOpen" :history="history" :from="compareFrom" :to="compareTo" />
    <NameDialog v-if="nameOpen" v-model:open="nameOpen" :history="history" :kind="nameKind" :source="nameSource" @created="created" />
    <VersionCrate v-if="crateOpen" v-model:open="crateOpen" :history="history" :version="crateVersion" />
    <VersionMerge
      v-if="merge"
      v-model:open="mergeOpen"
      :source="merge.source"
      :target="merge.target"
      :with-message="merge.withMessage"
      :run="merge.run"
      @merged="afterWrite(merge?.target === 'main')"
      @stale="history.refresh()"
    />
    <ConfirmAction
      v-if="confirm"
      v-model:open="confirmOpen"
      :title="confirm.title"
      :description="confirm.description"
      :action="confirm.action"
      :run="confirm.run"
      @done="confirm.done()"
    />
  </div>
</template>
