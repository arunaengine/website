<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import { termNameFromUri } from '@/lib/profiles/uri'
import { crateLocalId } from '@/lib/shacl/crateIri'
import type { ProfileValidationFinding, ProfileValidationPreviewResponse } from '@/lib/api'

// Advisory server validation of the crate about to be saved. The write path
// validates authoritatively, so nothing here gates submission.
const props = defineProps<{
  result: ProfileValidationPreviewResponse | null
  running: boolean
  error: string | null
  // Findings not already rendered inline at their control.
  findings: ProfileValidationFinding[]
  inlineCount?: number
}>()

defineEmits<{ (e: 'run'): void }>()

const SEVERITY_LABELS = [
  { severity: 'violation', label: 'Errors' },
  { severity: 'warning', label: 'Warnings' },
  { severity: 'info', label: 'Notes' },
] as const

const groups = computed(() =>
  SEVERITY_LABELS
    .map((group) => ({
      ...group,
      findings: props.findings.filter((finding) => finding.severity === group.severity),
    }))
    .filter((group) => group.findings.length),
)

const structural = computed(() => props.result?.structural_violations ?? [])

const stateLabel = computed(() => {
  if (props.result?.state === 'valid') return 'valid against the profile'
  if (props.result?.state === 'invalid') return 'invalid against the profile'
  return 'no registered profile referenced'
})

function severityClass(severity: string): string {
  if (severity === 'violation') return 'text-destructive'
  if (severity === 'warning') return 'text-amber-800 dark:text-amber-300'
  return 'text-muted-foreground'
}

// Where a panel finding sits: crate-local focus id plus the property short name.
function findingLocation(finding: ProfileValidationFinding): string {
  const focus = crateLocalId(finding.focus_node ?? '')
  const label = !focus || focus === './' ? 'Dataset' : focus
  return finding.path ? `${label} · ${termNameFromUri(finding.path)}` : label
}
</script>

<template>
  <div class="rounded-md border border-border p-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs font-medium text-foreground">Node validation preview</p>
      <div class="flex items-center gap-2">
        <span v-if="running" class="text-[11px] text-muted-foreground">Checking…</span>
        <Button type="button" variant="outline" size="sm" :disabled="running" @click="$emit('run')">
          Run preview
        </Button>
      </div>
    </div>
    <p class="mt-1 text-[11px] text-muted-foreground">
      Advisory check against the registered profile. Findings never block this form; the node validates the write itself.
    </p>
    <p v-if="error" class="mt-2 text-[11px] text-destructive">
      Node validation preview unavailable: {{ error }} Run preview to retry.
    </p>
    <template v-else-if="result">
      <p class="mt-2 text-[11px]" :class="result.accepted ? 'text-muted-foreground' : 'text-destructive'">
        <span class="font-medium">{{ result.accepted ? 'The node would accept this dataset.' : 'The node would reject this dataset.' }}</span>
        <span class="text-muted-foreground"> Profile state: {{ stateLabel }}.</span>
        <span v-if="result.completeness === 'incomplete'" class="text-muted-foreground">
          Some constraints could not be evaluated.
        </span>
      </p>
      <div v-if="structural.length" class="mt-2">
        <p class="text-[11px] font-medium text-destructive">RO-Crate structure</p>
        <ul class="mt-1 space-y-1">
          <li v-for="(violation, index) in structural" :key="`${violation.code}:${index}`" class="text-[11px] text-destructive">
            <span class="font-medium">{{ violation.entity_id || violation.pointer || violation.code }}:</span>
            {{ violation.message }}
          </li>
        </ul>
      </div>
      <p v-if="!findings.length && !structural.length && !inlineCount" class="mt-2 text-[11px] text-muted-foreground">
        No findings against the profile's shapes.
      </p>
      <p v-else-if="!groups.length && inlineCount" class="mt-2 text-[11px] text-muted-foreground">
        All findings are shown inline at their fields above.
      </p>
      <div v-for="group in groups" :key="group.severity" class="mt-2">
        <p class="text-[11px] font-medium" :class="severityClass(group.severity)">{{ group.label }}</p>
        <ul class="mt-1 space-y-1">
          <li
            v-for="(finding, index) in group.findings"
            :key="`${finding.rule}${finding.focus_node ?? ''}${index}`"
            class="text-[11px]"
            :class="severityClass(group.severity)"
          >
            <span class="font-medium">{{ findingLocation(finding) }}:</span> {{ finding.message }}
          </li>
        </ul>
      </div>
    </template>
    <p v-else class="mt-2 text-[11px] text-muted-foreground">Not checked yet.</p>
  </div>
</template>
