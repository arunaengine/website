<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import type { ProfileValidationPreviewResponse } from '@/lib/api'
import { collectIssues, type WriteIssue } from '@/lib/crate/issues'
import { displayName, entityName, findEntity, rootId, type CrateDraft } from '@/lib/crate/editor'
import { truncateMiddle } from '@/lib/utils'
import { Check, RefreshCw, Send, TriangleAlert } from '@lucide/vue'

// The node validates the draft exactly as a save would, without saving. It runs
// on demand and once more before every save. Only its verdict (or a refused
// write) blocks; advisory findings never do.


const props = defineProps<{
  draft: CrateDraft
  rocrate: unknown
  profileName?: string | null
  /** The picked profile's own crate is still being fetched for its rules. */
  profileLoading?: boolean
  /** The picked profile's rules failed to load; the form runs without them. */
  profileError?: string | null
  /** Why the save is unavailable, shown beside the disabled button. */
  blocked?: string | null
  previewResult?: ProfileValidationPreviewResponse | null
  previewRunning?: boolean
  previewError?: string | null
  previewUnavailable?: boolean
  writeIssues?: WriteIssue[]
  submitError?: string | null
  saving?: boolean
  canSave?: boolean
  actionLabel?: string
  busyLabel?: string
}>()
const emit = defineEmits<{
  (e: 'preview'): void
  (e: 'retry-profile'): void
  (e: 'save'): void
  (e: 'jump', entityId: string): void
}>()

const issues = computed(() => collectIssues(props.previewResult, props.writeIssues ?? [], props.draft))
const violations = computed(() => issues.value.filter((issue) => issue.severity === 'violation'))

const issueGroups = computed(() => {
  const grouped = new Map<string, typeof issues.value>()
  for (const issue of issues.value) grouped.set(issue.entityId, [...(grouped.get(issue.entityId) ?? []), issue])
  return [...grouped.entries()].map(([entityId, entries]) => ({
    entityId,
    name: groupName(entityId),
    isRoot: entityId === rootId(props.draft),
    resolved: entries.every((entry) => entry.resolved),
    violations: entries.filter((entry) => entry.severity === 'violation'),
    advisory: entries.filter((entry) => entry.severity !== 'violation'),
  }))
})
const advisoryGroups = computed(() => issueGroups.value.filter((group) => group.advisory.length))

const outcome = computed<'checking' | 'rejected' | 'failed' | 'accepted' | 'none'>(() => {
  if (props.previewRunning) return 'checking'
  if (props.previewResult?.accepted === false || props.writeIssues?.length || violations.value.length) {
    return 'rejected'
  }
  if (props.previewResult) return 'accepted'
  if (props.previewUnavailable || props.previewError) return 'failed'
  return 'none'
})

const failureReason = computed(() => props.previewUnavailable
  ? 'This node does not offer draft validation; the save is still validated.'
  : (props.previewError ?? ''))
// A node that does not know the picked profile checked the crate's structure
// only; saying "valid against" it would claim a check that never ran.
const profileLine = computed(() => {
  const referenced = props.previewResult?.profile_iri || props.previewResult?.profile_id
  if (props.profileName && (props.previewResult?.state === 'not_profiled' || !referenced)) {
    return `The node did not evaluate ${props.profileName}; it checked the structure of the crate only.`
  }
  return referenced ? `Valid against ${props.profileName || referenced}` : 'No profile referenced'
})
const problemCount = computed(() => {
  const count = Math.max(violations.value.length, 1)
  return count === 1 ? '1 problem' : `${count} problems`
})

function groupName(entityId: string): string {
  if (entityId === rootId(props.draft)) return entityName(props.draft.entities[0]) || 'This dataset'
  const entity = findEntity(props.draft, entityId)
  return entity ? displayName(entity) : entityId
}
</script>

<template>
  <section data-tour="editor-validation" data-tutorial="dataset-check" class="surface space-y-4 p-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Validation</h2>
        <p class="text-xs text-muted-foreground">The node validates the dataset exactly as it would on save, without saving anything. Saving validates first.</p>
      </div>
      <Button variant="outline" size="sm" :disabled="previewRunning" @click="emit('preview')">
        <Spinner v-if="previewRunning" class="text-current" aria-hidden="true" />
        <RefreshCw v-else class="h-3.5 w-3.5" />
        {{ outcome === 'none' ? 'Validate' : 'Validate again' }}
      </Button>
    </div>

    <p v-if="profileLoading" class="flex items-center gap-2 text-xs text-muted-foreground">
      <Spinner class="text-primary" aria-hidden="true" /> Loading the profile rules…
    </p>
    <Notice v-else-if="profileError" tone="error">
      {{ profileError }}
      <Button variant="link" size="sm" class="h-auto p-0" @click="emit('retry-profile')">Try again</Button>
    </Notice>

    <p v-if="outcome === 'checking'" class="flex items-center gap-2 text-xs text-muted-foreground">
      <Spinner class="text-primary" aria-hidden="true" /> Validating…
    </p>

    <p v-else-if="outcome === 'none'" class="text-xs text-muted-foreground">Not validated yet. Saving validates first.</p>

    <div v-else-if="outcome === 'accepted'" class="space-y-3">
      <Notice tone="success">
        <p class="flex items-center gap-2"><Check class="h-3.5 w-3.5 shrink-0" /> The node would accept this dataset.</p>
        <p class="mt-0.5 pl-5 text-[11px] text-muted-foreground">{{ profileLine }}</p>
      </Notice>
      <section v-for="group in advisoryGroups" :key="group.entityId" class="rounded-lg border border-border">
        <header class="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div class="min-w-0">
            <p class="truncate text-xs font-medium text-foreground">{{ group.name }}</p>
            <span v-if="!group.resolved" class="hash" :title="group.entityId">{{ truncateMiddle(group.entityId, 12, 8) }}</span>
          </div>
          <Badge variant="secondary">Advisory</Badge>
        </header>
        <ul class="divide-y divide-border">
          <li v-for="issue in group.advisory" :key="issue.key" class="px-3 py-2 text-xs">
            <p class="text-muted-foreground">{{ issue.message }}</p>
            <p v-if="issue.path" class="mt-0.5 font-mono text-[10px] text-muted-foreground">{{ issue.path }}</p>
          </li>
        </ul>
      </section>
    </div>

    <Notice v-else-if="outcome === 'failed'" tone="warning">Could not validate: {{ failureReason }}</Notice>

    <div v-else-if="outcome === 'rejected'" class="space-y-3">
      <p class="flex items-center gap-2 text-xs font-medium text-destructive">
        <TriangleAlert class="h-3.5 w-3.5 shrink-0" /> The node would reject this dataset: {{ problemCount }}
      </p>
      <section v-for="group in issueGroups" :key="group.entityId" class="rounded-lg border border-border">
        <header class="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div class="min-w-0">
            <p class="truncate text-xs font-medium text-foreground">{{ group.name }}</p>
            <span v-if="!group.resolved" class="hash" :title="group.entityId">{{ truncateMiddle(group.entityId, 12, 8) }}</span>
          </div>
          <Button variant="ghost" size="sm" @click="emit('jump', group.entityId)">
            {{ group.isRoot ? 'Open dataset' : 'Open' }}
          </Button>
        </header>
        <ul class="divide-y divide-border">
          <li v-for="issue in group.violations" :key="issue.key" class="px-3 py-2 text-xs">
            <p class="text-foreground">{{ issue.message }}</p>
            <p v-if="issue.path" class="mt-0.5 font-mono text-[10px] text-muted-foreground">{{ issue.path }}</p>
          </li>
          <li v-if="group.advisory.length" class="px-3 py-2">
            <Badge variant="secondary">Advisory</Badge>
            <div v-for="issue in group.advisory" :key="issue.key" class="mt-1.5 text-xs">
              <p class="text-muted-foreground">{{ issue.message }}</p>
              <p v-if="issue.path" class="mt-0.5 font-mono text-[10px] text-muted-foreground">{{ issue.path }}</p>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>
    <div class="flex flex-wrap items-center justify-end gap-3">
      <p v-if="blocked && !saving" class="min-w-0 text-xs text-muted-foreground">{{ blocked }}</p>
      <Button data-tour="editor-save" data-tutorial="dataset-save" :disabled="!canSave || saving" @click="emit('save')">
        <Spinner v-if="saving" class="text-current" aria-hidden="true" />
        <Send v-else class="h-4 w-4" />
        {{ saving ? (busyLabel ?? 'Creating') : (actionLabel ?? 'Create dataset') }}
      </Button>
    </div>
  </section>
</template>
