<script setup lang="ts">
// The profiles a dataset conforms to and their check result, said once: "Valid", "N issues" with a
// dialog of the findings, or "Not checked". Conformance comes from the node's status route.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import RequirementFindings from '@/components/metadata/view/RequirementFindings.vue'
import { readableIri, useAruna } from '@/composables/useAruna'
import { profileIdFromConformanceId } from '@/composables/aruna/profileIri'
import { crateGraph, stringProp } from '@/lib/dataEntities'
import { isHttpUrl } from '@/lib/utils'
import type { DatasetViewState } from '@/composables/useDatasetView'
import { TriangleAlert } from '@lucide/vue'

const props = defineProps<{ state: DatasetViewState }>()
const { current, currentCrate, detailId } = props.state
const { profiles: allProfiles, profileValidationStatuses, loadProfileValidationStatus, revalidateProfileValidationStatus } = useAruna()

// Each conformsTo profile: a known profile links to its page, a crate entity gives its name.
const profiles = computed(() => {
  const graph = crateGraph(currentCrate.value)
  return (current.value?.conformsToIds ?? []).map((iri) => {
    const local = profileIdFromConformanceId(iri)
    const known = local ? allProfiles.value.find((profile) => profile.id === local) : undefined
    const entity = graph.find((candidate) => candidate['@id'] === iri)
    const name = known?.name ?? stringProp(entity?.name)
    const version = known ? '' : stringProp(entity?.version)
    return {
      key: iri,
      label: name ? [name, version].filter(Boolean).join(' ') : readableIri(iri),
      profileId: known?.id ?? '',
      href: !known && isHttpUrl(iri) ? iri : undefined,
    }
  })
})

const validation = computed(() => profileValidationStatuses.value[detailId.value])
watch(
  () => [detailId.value, profiles.value.length] as const,
  ([id, count]) => {
    if (id && count) void loadProfileValidationStatus(id).catch(() => undefined)
  },
  { immediate: true },
)
const findings = computed(() => validation.value?.response?.findings ?? [])
const issueCount = computed(() => findings.value.filter((finding) => finding.severity !== 'info').length)
const statusText = computed(() => {
  const status = validation.value?.status
  const many = profiles.value.length > 1
  if (status === 'verified') return many ? `${profiles.value.length} profiles, all valid` : 'Valid'
  if (status === 'checking') return 'Checking'
  if (status === 'partial') return many ? `${profiles.value.length} profiles, partly checked` : 'Partly checked'
  return many ? `${profiles.value.length} profiles, not checked` : 'Not checked'
})
const issuesOpen = ref(false)
</script>

<template>
  <span v-if="!profiles.length" class="text-muted-foreground">No profile</span>
  <span v-else class="flex flex-col gap-1">
    <span class="flex flex-wrap items-center gap-2">
      <button v-if="validation?.status === 'invalid'" type="button" class="rounded-full" @click="issuesOpen = true">
        <Badge variant="warn" class="cursor-pointer gap-1"><TriangleAlert class="size-3" aria-hidden="true" />{{ issueCount || findings.length }} {{ (issueCount || findings.length) === 1 ? 'issue' : 'issues' }}</Badge>
      </button>
      <span v-else class="text-xs" :class="validation?.status === 'verified' ? 'font-medium text-status-ok' : 'text-muted-foreground'" :title="validation?.message">{{ statusText }}</span>
      <button v-if="validation?.stale" type="button" class="text-xs font-medium text-primary hover:underline" @click="revalidateProfileValidationStatus(detailId).catch(() => undefined)">Check again</button>
      <button v-else-if="validation?.status === 'unavailable'" type="button" class="text-xs font-medium text-primary hover:underline" @click="loadProfileValidationStatus(detailId, true).catch(() => undefined)">Retry</button>
      <button v-if="validation?.status === 'partial' && findings.length" type="button" class="text-xs font-medium text-primary hover:underline" @click="issuesOpen = true">Show findings</button>
    </span>
    <span class="flex flex-wrap gap-x-3 gap-y-1">
      <template v-for="profile in profiles" :key="profile.key">
        <RouterLink v-if="profile.profileId" :to="{ name: 'profile', params: { profileId: profile.profileId } }" class="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">{{ profile.label }}</RouterLink>
        <a v-else-if="profile.href" :href="profile.href" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline" :title="profile.key">{{ profile.label }}</a>
        <span v-else :title="profile.key">{{ profile.label }}</span>
      </template>
    </span>
  </span>

  <Dialog v-model:open="issuesOpen">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>Profile issues</DialogTitle>
        <DialogDescription>{{ profiles.map((profile) => profile.label).join(', ') }}</DialogDescription>
      </DialogHeader>
      <RequirementFindings :findings="findings" />
    </DialogContent>
  </Dialog>
</template>
