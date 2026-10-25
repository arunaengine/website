<script setup lang="ts">
// The datasets that link a file, a folder or a bucket as a part. A file is part of every dataset
// whose linked part contains its key. The list is bounded, so it says when it may be incomplete.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useDatasetLinks, type LinkTarget } from '@/composables/useDatasetLinks'

const props = defineProps<{ heading: string; target: LinkTarget; card?: boolean; quietEmpty?: boolean; exclude?: string }>()

const target = computed(() => props.target)
const links = useDatasetLinks(target)
const documents = computed(() => links.documents.value.filter((document) => document.document_id !== props.exclude))

// A node without the route shows nothing at all; an empty list hides only when it is the whole answer.
const settledEmpty = computed(
  () => links.state.value === 'ready' && !documents.value.length && !links.hidden.value && links.complete.value && !links.more.value && !links.error.value,
)
const visible = computed(() => links.state.value !== 'missing' && !(props.quietEmpty && settledEmpty.value))
</script>

<template>
  <section v-if="visible" :class="card ? 'surface' : 'space-y-2 border-t border-border pt-4'">
    <header v-if="card" class="border-b border-border px-5 py-4">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">{{ heading }}</h2>
    </header>
    <h3 v-else class="text-sm font-medium text-foreground">{{ heading }}</h3>
    <div :class="card ? 'space-y-2 px-5 py-4' : 'space-y-2'">
      <Spinner v-if="links.state.value === 'loading'" label="Looking for datasets" />
      <p v-else-if="links.state.value === 'failed'" class="text-xs text-muted-foreground">
        The datasets could not be read: {{ links.error.value }}
        <button type="button" class="text-primary hover:underline" @click="links.reload()">Try again</button>
      </p>
      <template v-else>
        <p v-if="!documents.length && !links.more.value" class="text-xs text-muted-foreground">None you can read.</p>
        <ul v-else class="space-y-1 text-xs">
          <li v-for="document in documents" :key="document.document_id">
            <RouterLink :to="{ name: 'dataset', params: { id: document.document_id } }" class="font-medium text-primary hover:underline">
              {{ document.title || document.document_path }}
            </RouterLink>
          </li>
        </ul>
        <Button v-if="links.more.value" variant="ghost" size="sm" :disabled="links.loadingMore.value" @click="links.loadMore()">More datasets</Button>
        <p v-if="links.hidden.value" class="text-xs text-muted-foreground">Some datasets are not visible to you.</p>
        <p v-if="!links.complete.value" class="text-xs text-muted-foreground">The list may be incomplete: a node did not answer or is still indexing.</p>
        <p v-if="links.error.value" class="text-xs text-muted-foreground">More datasets could not be read: {{ links.error.value }}</p>
      </template>
    </div>
  </section>
</template>
