<script setup lang="ts">
// About: the description, a grid of labeled facts, keyword pills, identifiers and every other root
// property of the crate. A reference opens its entity in the page's modal.
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useResizeObserver } from '@vueuse/core'
import Button from '@/components/ui/Button.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EntityFieldList from '@/components/metadata/EntityFieldList.vue'
import ProfileSummary from '@/components/metadata/view/ProfileSummary.vue'
import PersistentIdRow from '@/components/metadata/view/PersistentIdRow.vue'
import type { DatasetViewState } from '@/composables/useDatasetView'
import { ABOUT_KEYS, aboutFacts } from '@/lib/datasetAbout'
import { formatCount } from '@/lib/formatCount'
import { isHttpUrl } from '@/lib/utils'
import { ChevronDown, ChevronUp, Info } from '@lucide/vue'

const props = defineProps<{ state: DatasetViewState }>()
const emit = defineEmits<{ (e: 'open', id: string): void; (e: 'cite'): void }>()
const { current, currentCrate, presentation, licenseLabel, loadingCrate, crateNotReady, crateError, cratePending, detailId, fetchCrate } = props.state

const facts = computed(() => aboutFacts(currentCrate.value))
const fields = computed(() => presentation.value.fields.filter((field) => !ABOUT_KEYS.has(field.key)))

// "Show more" only when the description is cut off.
const description = ref<HTMLElement | null>(null)
const expanded = ref(false)
const clamped = ref(false)
function measure() {
  const el = description.value
  clamped.value = Boolean(el && el.scrollHeight > el.clientHeight + 1)
}
useResizeObserver(description, measure)
watch(() => current.value?.description, () => {
  expanded.value = false
  void nextTick(measure)
})
</script>

<template>
  <section aria-labelledby="about-heading">
    <SectionHeading id="about-heading" title="About" :icon="Info" />
    <div class="surface p-5">
      <div v-if="current?.description" class="mb-5">
        <p class="text-xs text-muted-foreground">Description</p>
        <p ref="description" class="mt-0.5 max-w-[90ch] whitespace-pre-line text-sm" :class="expanded ? '' : 'line-clamp-3'">{{ current.description }}</p>
        <Button v-if="clamped || expanded" variant="ghost" size="sm" class="mt-1 h-7 px-2" :aria-expanded="expanded" @click="expanded = !expanded">
          <component :is="expanded ? ChevronUp : ChevronDown" class="h-3.5 w-3.5" /> {{ expanded ? 'Show less' : 'Show more' }}
        </Button>
      </div>

      <dl class="mb-5 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-border-subtle py-4 sm:grid-cols-4">
        <div class="min-w-0">
          <dt class="text-xs text-muted-foreground">License</dt>
          <dd class="mt-0.5 truncate text-sm">
            <a v-if="current?.license && isHttpUrl(current.license)" :href="current.license" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline" :title="current.license">{{ licenseLabel }}</a>
            <span v-else-if="current?.license" :title="current.license">{{ licenseLabel }}</span>
            <span v-else class="text-muted-foreground">Not given</span>
          </dd>
        </div>
        <div v-if="facts.published" class="min-w-0">
          <dt class="text-xs text-muted-foreground">Published</dt>
          <dd class="mt-0.5 truncate text-sm tabular-nums">{{ facts.published }}</dd>
        </div>
        <div v-if="facts.modified" class="min-w-0">
          <dt class="text-xs text-muted-foreground">Modified</dt>
          <dd class="mt-0.5 truncate text-sm tabular-nums">{{ facts.modified }}</dd>
        </div>
        <div v-if="facts.size" class="min-w-0">
          <dt class="text-xs text-muted-foreground">Size</dt>
          <dd class="mt-0.5 truncate text-sm tabular-nums">{{ facts.size }}</dd>
        </div>
        <div v-if="facts.files" class="min-w-0">
          <dt class="text-xs text-muted-foreground">Files</dt>
          <dd class="mt-0.5 truncate text-sm tabular-nums">{{ formatCount(facts.files) }}</dd>
        </div>
        <div class="col-span-2 min-w-0 sm:col-span-4">
          <dt class="text-xs text-muted-foreground">Profile</dt>
          <dd class="mt-0.5 text-sm"><ProfileSummary :state="state" /></dd>
        </div>
      </dl>

      <dl class="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)]">
        <template v-if="current?.keywords.length">
          <dt class="text-muted-foreground">Keywords</dt>
          <dd class="flex flex-wrap gap-1.5">
            <RouterLink
              v-for="keyword in current.keywords"
              :key="keyword"
              :to="{ name: 'datasets', query: { q: keyword } }"
              class="chip text-foreground/80 hover:border-primary/40 hover:text-foreground"
              :title="`Search datasets with ${keyword}`"
            >{{ keyword }}</RouterLink>
          </dd>
        </template>
        <template v-if="facts.identifiers.length">
          <dt class="text-muted-foreground">{{ facts.identifiers.length === 1 ? 'Identifier' : 'Identifiers' }}</dt>
          <dd class="flex min-w-0 flex-col gap-1">
            <template v-for="identifier in facts.identifiers" :key="identifier.text">
              <a v-if="identifier.href" :href="identifier.href" target="_blank" rel="noopener noreferrer" class="truncate text-primary hover:underline" :title="identifier.href">{{ identifier.text }}</a>
              <span v-else class="truncate" :title="identifier.text">{{ identifier.text }}</span>
            </template>
          </dd>
        </template>
        <PersistentIdRow v-if="detailId" :document-id="detailId" />
        <dt class="text-muted-foreground">Cite as</dt>
        <dd class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <a v-if="facts.doi" :href="facts.doi" target="_blank" rel="noopener noreferrer" class="truncate text-primary hover:underline">{{ facts.doi }}</a>
          <button type="button" class="text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground" @click="emit('cite')">Cite</button>
        </dd>
      </dl>

      <EntityFieldList v-if="fields.length" :fields="fields" class="mt-2.5" @jump="(id: string) => emit('open', id)" />

      <div v-if="loadingCrate && !fields.length" class="mt-4 space-y-2.5">
        <Skeleton v-for="n in 3" :key="n" class="h-3.5 w-72" />
        <p class="pt-1 text-xs text-muted-foreground">{{ cratePending[detailId] ? 'Preparing the dataset…' : 'Loading full RO-Crate…' }}</p>
      </div>
      <p v-else-if="crateNotReady" class="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
        This dataset is still being prepared.
        <Button variant="outline" size="sm" @click="fetchCrate(detailId)">Retry</Button>
      </p>
      <p v-else-if="crateError" class="mt-4 text-xs text-destructive">{{ crateError }}</p>
    </div>
  </section>
</template>
