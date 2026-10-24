<script setup lang="ts">
// The datasets a file is part of: those whose live linked parts contain it. Ten show first.
// Anything beyond that is paged, and the answer says when it may be incomplete.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import LinkedDatasets from '@/components/data/LinkedDatasets.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useFilePartOf, type PartOfTarget } from '@/composables/useFilePartOf'

const props = defineProps<{ target: PartOfTarget }>()

const part = useFilePartOf(computed(() => props.target))
const all = ref(false)
watch(() => [props.target.bucket, props.target.key], () => (all.value = false))
</script>

<template>
  <section v-if="part.state.value !== 'missing' && !(part.state.value === 'ready' && !part.found.value?.datasets.length && !part.found.value?.hidden_references_exist)" class="space-y-2 border-t border-border pt-4">
    <h3 class="text-sm font-medium text-foreground">Part of</h3>
    <Spinner v-if="part.state.value === 'loading'" label="Looking for datasets" />
    <p v-else-if="part.state.value === 'failed'" class="text-xs text-muted-foreground">
      The datasets could not be read: {{ part.error.value }}
      <button type="button" class="text-primary hover:underline" @click="part.reload()">Try again</button>
    </p>
    <template v-else-if="part.found.value">
      <LinkedDatasets
        v-if="all"
        heading="All datasets"
        :target="{ bucket: target.bucket, key: target.key, folder: false, remote: false }"
      />
      <template v-else>
        <ul class="space-y-1 text-xs">
          <li v-for="dataset in part.found.value.datasets" :key="dataset.document_id">
            <RouterLink :to="{ name: 'dataset', params: { id: dataset.document_id } }" class="font-medium text-primary hover:underline">
              {{ dataset.title || dataset.document_id }}
            </RouterLink>
          </li>
        </ul>
        <button v-if="part.found.value.more" type="button" class="text-xs text-primary hover:underline" @click="all = true">
          More datasets
        </button>
        <p v-if="part.found.value.hidden_references_exist" class="text-xs text-muted-foreground">Some datasets are not visible to you.</p>
        <p v-if="!part.found.value.complete" class="text-xs text-muted-foreground">The list may be incomplete: a node did not answer or is still indexing.</p>
      </template>
    </template>
  </section>
</template>
