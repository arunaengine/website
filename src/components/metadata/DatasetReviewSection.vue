<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import VisibilitySelect from '@/components/metadata/VisibilitySelect.vue'
import type { ProfileValidationPreviewResponse } from '@/lib/api'
import type { ContextEntity } from '@/lib/crate/build'
import { collectIssues, sectionOf, type WriteIssue } from '@/lib/crate/issues'
import { truncateMiddle } from '@/lib/utils'
import { Check, RefreshCw, Send, TriangleAlert } from '@lucide/vue'

const JSON_LD_KEY = 'aruna.dataset.showJsonLd'

const props = defineProps<{
  rocrate: unknown
  visibility: 'group' | 'public'
  groupId?: string
  entities?: ContextEntity[]
  rootName?: string
  partIds?: string[]
  profileName?: string | null
  previewResult?: ProfileValidationPreviewResponse | null
  previewRunning?: boolean
  previewError?: string | null
  previewUnavailable?: boolean
  writeIssues?: WriteIssue[]
  submitError?: string | null
  saving?: boolean
  canCreate?: boolean
  actionLabel?: string
  busyLabel?: string
}>()
const emit = defineEmits<{
  (e: 'update:visibility', value: 'group' | 'public'): void
  (e: 'preview'): void
  (e: 'visible'): void
  (e: 'create'): void
  (e: 'jump', entityId: string): void
}>()

const json = computed(() => JSON.stringify(props.rocrate, null, 2))
const partIds = computed(() => new Set(props.partIds ?? []))
const issues = computed(() => collectIssues(props.previewResult, props.writeIssues ?? []))

const issueGroups = computed(() => {
  const grouped = new Map<string, typeof issues.value>()
  for (const issue of issues.value) {
    grouped.set(issue.entityId, [...(grouped.get(issue.entityId) ?? []), issue])
  }
  return [...grouped.entries()].map(([entityId, entries]) => ({
    entityId,
    name: entityName(entityId),
    violations: entries.filter((entry) => entry.severity === 'violation'),
    advisory: entries.filter((entry) => entry.severity !== 'violation'),
  }))
})

// Exactly one outcome renders. Only the node's verdict (or a failed write)
// rejects; advisory findings are listed under an accepted verdict.
const violations = computed(() => issues.value.filter((issue) => issue.severity === 'violation'))
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
  ? 'This node does not offer draft checks; the save is still validated.'
  : (props.previewError ?? ''))
const profileLine = computed(() => {
  const referenced = props.previewResult?.profile_iri || props.previewResult?.profile_id
  if (!referenced) return 'No profile referenced'
  return `Valid against ${props.profileName || referenced}`
})
const problemCount = computed(() => {
  const count = Math.max(violations.value.length, 1)
  return count === 1 ? '1 problem' : `${count} problems`
})
const advisoryGroups = computed(() => issueGroups.value.filter((group) => group.advisory.length))

function entityName(entityId: string): string {
  if (entityId === './') return props.rootName?.trim() || 'This dataset'
  const entity = props.entities?.find((candidate) => candidate.id === entityId)
  const name = entity?.properties.name
  return typeof name === 'string' && name.trim() ? name : entityId
}

function jumpLabel(entityId: string): string {
  return sectionOf(entityId, partIds.value) === 'basics' ? 'Jump to Basics' : 'Jump to Context'
}

const showJson = ref(false)
function rememberJson(event: Event) {
  showJson.value = Boolean((event.target as HTMLDetailsElement).open)
  try {
    globalThis.localStorage?.setItem(JSON_LD_KEY, String(showJson.value))
  } catch {
    // A browser without writable storage simply forgets the choice.
  }
}

const root = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
onMounted(() => {
  try {
    showJson.value = globalThis.localStorage?.getItem(JSON_LD_KEY) === 'true'
  } catch {
    showJson.value = false
  }
  // Guarded for SSR and the test renderer, which have no observer.
  if (typeof IntersectionObserver === 'undefined' || !root.value) return
  // One automatic run on arrival; later edits go through the debounced check.
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer?.disconnect()
    emit('visible')
  }, { threshold: 0.1 })
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="root" class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold text-foreground">Check with the node</h3>
        <p class="text-xs text-muted-foreground">The node checks the dataset exactly as it would on save, without saving anything.</p>
      </div>
      <Button variant="outline" size="sm" :disabled="previewRunning" @click="emit('preview')">
        <Spinner v-if="previewRunning" class="text-current" aria-hidden="true" />
        <RefreshCw v-else class="h-3.5 w-3.5" />
        Check again
      </Button>
    </div>

    <p v-if="outcome === 'checking'" class="flex items-center gap-2 text-xs text-muted-foreground">
      <Spinner class="text-primary" aria-hidden="true" /> Checking…
    </p>

    <p v-else-if="outcome === 'none'" class="text-xs text-muted-foreground">Not checked yet.</p>

    <div v-else-if="outcome === 'accepted'" class="space-y-3">
      <Notice tone="success">
        <p class="flex items-center gap-2"><Check class="h-3.5 w-3.5 shrink-0" /> The node would accept this dataset.</p>
        <p class="mt-0.5 pl-5 text-[11px] text-muted-foreground">{{ profileLine }}</p>
      </Notice>
      <section v-for="group in advisoryGroups" :key="group.entityId" class="rounded-lg border border-border">
        <header class="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div class="min-w-0">
            <p class="truncate text-xs font-medium text-foreground">{{ group.name }}</p>
            <span class="hash" :title="group.entityId">{{ truncateMiddle(group.entityId, 12, 8) }}</span>
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

    <Notice v-else-if="outcome === 'failed'" tone="warning">Could not check: {{ failureReason }}</Notice>

    <div v-else-if="outcome === 'rejected'" class="space-y-3">
      <p class="flex items-center gap-2 text-xs font-medium text-destructive">
        <TriangleAlert class="h-3.5 w-3.5 shrink-0" /> The node would reject this dataset: {{ problemCount }}
      </p>
      <section v-for="group in issueGroups" :key="group.entityId" class="rounded-lg border border-border">
        <header class="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div class="min-w-0">
            <p class="truncate text-xs font-medium text-foreground">{{ group.name }}</p>
            <span class="hash" :title="group.entityId">{{ truncateMiddle(group.entityId, 12, 8) }}</span>
          </div>
          <Button variant="ghost" size="sm" @click="emit('jump', group.entityId)">{{ jumpLabel(group.entityId) }}</Button>
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

    <VisibilitySelect
      :model-value="visibility"
      :group-id="groupId"
      @update:model-value="(value) => emit('update:visibility', value)"
    />

    <details class="rounded-lg border border-border" :open="showJson" @toggle="rememberJson">
      <summary class="cursor-pointer px-3 py-2 text-xs font-medium text-foreground">Show JSON-LD</summary>
      <div class="border-t border-border p-3">
        <div class="mb-2 flex justify-end">
          <CopyButton :value="json" label="Copy the JSON-LD" />
        </div>
        <pre class="max-h-96 overflow-auto rounded-md bg-muted/30 p-3 text-[11px] leading-relaxed"><code>{{ json }}</code></pre>
      </div>
    </details>

    <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>
    <div class="flex justify-end">
      <Button :disabled="!canCreate || saving" @click="emit('create')">
        <Spinner v-if="saving" class="text-current" aria-hidden="true" />
        <Send v-else class="h-4 w-4" />
        {{ saving ? (busyLabel ?? 'Creating') : (actionLabel ?? 'Create dataset') }}
      </Button>
    </div>
  </div>
</template>
