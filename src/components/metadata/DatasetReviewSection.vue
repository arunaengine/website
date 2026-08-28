<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import VisibilitySelect from '@/components/metadata/VisibilitySelect.vue'
import type { ProfileValidationPreviewResponse } from '@/lib/api'
import { Check, Clipboard, Loader2, Play, Send } from '@lucide/vue'

const props = defineProps<{
  rocrate: unknown
  visibility: 'group' | 'public'
  groupId?: string
  previewResult?: ProfileValidationPreviewResponse | null
  previewRunning?: boolean
  previewError?: string | null
  writeIssues?: Array<{
    code?: string
    message: string
    entityId?: string | null
    path?: string | null
    severity?: string
  }>
  submitError?: string | null
  saving?: boolean
  canCreate?: boolean
  actionLabel?: string
  busyLabel?: string
}>()
const emit = defineEmits<{
  (e: 'update:visibility', value: 'group' | 'public'): void
  (e: 'preview'): void
  (e: 'create'): void
  (e: 'jump', entityId: string): void
}>()

const copied = ref(false)
const json = computed(() => JSON.stringify(props.rocrate, null, 2))

const issues = computed(() => [
  ...(props.previewResult?.structural_violations ?? []).map((issue) => ({
    key: `structural:${issue.code}:${issue.pointer ?? ''}`,
    code: issue.code,
    message: issue.message,
    entityId: issue.entity_id ?? './',
    path: issue.pointer,
    severity: 'violation',
  })),
  ...(props.previewResult?.findings ?? []).map((issue) => ({
    key: `finding:${issue.code}:${issue.focus_node ?? ''}:${issue.path ?? ''}`,
    code: issue.code,
    message: issue.message,
    entityId: issue.focus_node ?? './',
    path: issue.path,
    severity: issue.severity,
  })),
  ...(props.writeIssues ?? []).map((issue, index) => ({
    key: `write:${issue.code ?? index}:${issue.entityId ?? ''}:${issue.path ?? ''}`,
    code: issue.code ?? 'write',
    message: issue.message,
    entityId: issue.entityId ?? './',
    path: issue.path,
    severity: issue.severity ?? 'violation',
  })),
])

const issueGroups = computed(() => {
  const grouped = new Map<string, typeof issues.value>()
  for (const issue of issues.value) {
    const entityId = issue.entityId || './'
    grouped.set(entityId, [...(grouped.get(entityId) ?? []), issue])
  }
  return [...grouped.entries()].map(([entityId, entries]) => ({ entityId, entries }))
})

async function copyJson() {
  await navigator.clipboard?.writeText(json.value)
  copied.value = true
  window.setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold text-foreground">Validation</h3>
        <p class="text-xs text-muted-foreground">The node write remains authoritative.</p>
      </div>
      <Button variant="outline" size="sm" :disabled="previewRunning" @click="emit('preview')">
        <Loader2 v-if="previewRunning" class="h-3.5 w-3.5 animate-spin" />
        <Play v-else class="h-3.5 w-3.5" />
        Run preview
      </Button>
    </div>

    <p v-if="previewError" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      {{ previewError }}
    </p>
    <p v-if="previewResult && !issues.length" class="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
      <Check class="h-3.5 w-3.5" /> No validation findings.
    </p>
    <section v-for="group in issueGroups" :key="group.entityId" class="rounded-lg border border-border">
      <header class="flex items-center justify-between border-b border-border px-3 py-2">
        <span class="truncate font-mono text-xs text-foreground">{{ group.entityId }}</span>
        <Button variant="ghost" size="sm" @click="emit('jump', group.entityId)">Jump to</Button>
      </header>
      <ul class="divide-y divide-border">
        <li v-for="issue in group.entries" :key="issue.key" class="px-3 py-2 text-xs">
          <div class="flex items-start gap-2">
            <Badge :variant="issue.severity === 'warning' ? 'warn' : issue.severity === 'info' ? 'secondary' : 'destructive'">{{ issue.severity }}</Badge>
            <div>
              <p class="text-foreground">{{ issue.message }}</p>
              <p v-if="issue.path" class="mt-0.5 font-mono text-[10px] text-muted-foreground">{{ issue.path }}</p>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <VisibilitySelect
      :model-value="visibility"
      :group-id="groupId"
      @update:model-value="(value) => emit('update:visibility', value)"
    />

    <div>
      <div class="mb-2 flex items-center justify-between gap-3">
        <h3 class="text-sm font-semibold text-foreground">JSON-LD</h3>
        <Button variant="outline" size="sm" @click="copyJson">
          <Check v-if="copied" class="h-3.5 w-3.5" />
          <Clipboard v-else class="h-3.5 w-3.5" />
          {{ copied ? 'Copied' : 'Copy' }}
        </Button>
      </div>
      <pre class="max-h-96 overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-[11px] leading-relaxed"><code>{{ json }}</code></pre>
    </div>

    <p v-if="submitError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      {{ submitError }}
    </p>
    <div class="flex justify-end">
      <Button :disabled="!canCreate || saving" @click="emit('create')">
        <Loader2 v-if="saving" class="h-4 w-4 animate-spin" />
        <Send v-else class="h-4 w-4" />
        {{ saving ? (busyLabel ?? 'Creating') : (actionLabel ?? 'Create dataset') }}
      </Button>
    </div>
  </div>
</template>
