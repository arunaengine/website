<script setup lang="ts">
// What a repository still needs from the dataset: violations block, warnings do not.
// Content findings name files the repository will not take.
import { computed } from 'vue'
import type { ProfileValidationFinding } from '@/lib/api'
import { findingHeading } from '@/lib/repository'
import { pathMembers } from '@/lib/shacl/mapFindings'
import { termNameFromUri } from '@/lib/profiles/uri'

// omitted counts findings the node left out of its capped list.
const props = defineProps<{ findings: readonly ProfileValidationFinding[]; omitted?: number | null }>()

const ordered = computed(() =>
  [...props.findings].sort((a, b) => Number(b.severity === 'violation') - Number(a.severity === 'violation')),
)

// A structural finding's path is a JSON pointer into the crate, not a field.
function field(finding: ProfileValidationFinding): string {
  const members = finding.path && finding.rule !== 'structural' ? pathMembers(finding.path) : []
  return members.map(termNameFromUri).join(' or ')
}
</script>

<template>
  <ul v-if="ordered.length" class="space-y-1 text-xs">
    <li
      v-for="(finding, index) in ordered"
      :key="index"
      :class="finding.severity === 'violation' ? 'text-destructive' : finding.severity === 'warning' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'"
    >
      <span class="font-medium">{{ findingHeading(finding) }}:</span>
      <span v-if="field(finding)" class="font-mono"> {{ field(finding) }}</span>
      {{ finding.message }}
    </li>
    <li v-if="omitted" class="text-muted-foreground">{{ omitted }} more not shown.</li>
  </ul>
</template>
