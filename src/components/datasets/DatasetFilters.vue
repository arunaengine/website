<script setup lang="ts">
// Facet config for the Datasets filter row: type, profile, group, and the
// favourites toggle a signed-in user gets.
import { computed } from 'vue'
import SearchFilterBar, { type Facet, type FilterModel } from '@/components/search/SearchFilterBar.vue'
import { useAruna } from '@/composables/useAruna'
import { CRATE_TYPES } from '@/lib/crateType'
import { truncateMiddle } from '@/lib/utils'
import { Star } from '@lucide/vue'

const props = defineProps<{
  modelValue: FilterModel
  groupOptions: Array<{ id: string; label: string }>
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: FilterModel): void }>()

const { profiles, currentUser } = useAruna()

const profileFilter = computed(() =>
  typeof props.modelValue.profile === 'string' ? props.modelValue.profile : null,
)

// Per-facet option lists (no "All" entry: SearchFilterBar prepends it). Each keeps
// the active value present so a filter carried in from the URL is never dropped.
const profileFacetOptions = computed(() => {
  const options: Array<{ value: string; label: string }> = []
  const seen = new Set<string>()
  for (const profile of profiles.value) {
    options.push({ value: profile.id, label: profile.name || profile.shortName })
    seen.add(profile.id)
  }
  if (profileFilter.value && !seen.has(profileFilter.value)) {
    options.push({ value: profileFilter.value, label: truncateMiddle(profileFilter.value) })
  }
  return options
})
const typeFacetOptions = CRATE_TYPES.map((entry) => ({ value: entry.value, label: entry.label }))
const groupFacetOptions = computed(() => props.groupOptions.map((option) => ({ value: option.id, label: option.label })))

// Extensible filter config: one entry per facet. Adding a facet means pushing
// one more entry here (single select, `multi: true`, or `toggle: true`) with no
// template changes. The favourites toggle only appears for a signed-in user.
const filterFacets = computed<Facet[]>(() => {
  const facets: Facet[] = [
    { key: 'type', label: 'Type', options: typeFacetOptions, multi: true },
    { key: 'profile', label: 'Profile', options: profileFacetOptions.value },
  ]
  facets.push({ key: 'group', label: 'Group', options: groupFacetOptions.value })
  if (currentUser.value) facets.push({ key: 'favourites', label: 'Favourites', toggle: true, icon: Star })
  return facets
})
</script>

<template>
  <SearchFilterBar
    :model-value="modelValue"
    :facets="filterFacets"
    aria-label="Dataset filters"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
