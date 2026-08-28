<script setup lang="ts">
// Cross-document references from the root's mentions/citation/about, split
// into in-portal links (a catalog document's graph IRI or document id) and
// plain external IRIs.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import { useAruna } from '@/composables/useAruna'
import type { DatasetViewState } from '@/composables/useDatasetView'
import { crateGraph, crateRootId, stringProp } from '@/lib/dataEntities'
import { documentIdFromIri, isDocumentId } from '@/lib/graphIri'
import { isHttpUrl } from '@/lib/utils'
import { Link2 } from '@lucide/vue'

interface RelatedDocRow {
  iri: string
  label: string
  documentId?: string
}

const props = defineProps<{ state: DatasetViewState }>()
const { currentCrate } = props.state
const { getMetadataItem, toMetadataDoc } = useAruna()

// Portal-internal targets are recognised by their graph IRI alone; the label
// falls back to a targeted fetch when the crate carries no stub name.
const relatedPaths = ref<Record<string, string>>({})

// One attempt per document and page visit: a failed lookup must not retrigger
// every time another row's resolution recomputes the related list.
const relatedAttempted = new Set<string>()
async function ensureRelatedPath(documentId: string) {
  if (relatedPaths.value[documentId] || relatedAttempted.has(documentId)) return
  relatedAttempted.add(documentId)
  try {
    const item = await getMetadataItem(documentId)
    const title = toMetadataDoc(item).title || item.document_path
    relatedPaths.value = { ...relatedPaths.value, [documentId]: title }
  } catch {
    // Deleted or unreadable: the row keeps its stub name or IRI as the label.
  }
}

const relatedDocs = computed<RelatedDocRow[]>(() => {
  const crate = currentCrate.value
  const g = crateGraph(crate)
  if (!g.length) return []
  const rootId = crateRootId(crate)
  const root = rootId ? g.find((e) => e['@id'] === rootId) : undefined
  if (!root) return []
  const rows: RelatedDocRow[] = []
  const seen = new Set<string>()
  for (const property of ['mentions', 'citation', 'about'] as const) {
    const refs = root[property]
    for (const ref of Array.isArray(refs) ? refs : refs ? [refs] : []) {
      const iri = stringProp(ref)
      // Crate-local fragments (a run crate's own #run action) are internal
      // wiring; related documents have in-graph stubs and must still render.
      if (!iri || seen.has(iri) || iri.startsWith('#')) continue
      seen.add(iri)
      const documentId = documentIdFromIri(iri) ?? (isDocumentId(iri) ? iri : null)
      const entity = g.find((e) => e['@id'] === iri)
      rows.push({
        iri,
        documentId: documentId ?? undefined,
        // The in-graph stub name is frozen at link time; the live document's
        // title wins, and the stub only fills in while the fetch is pending
        // or when the document is gone.
        label: (documentId ? relatedPaths.value[documentId] : '') || stringProp(entity?.name) || iri,
      })
    }
  }
  return rows
})

watch(relatedDocs, (rows) => {
  for (const row of rows) {
    if (row.documentId && !relatedPaths.value[row.documentId]) void ensureRelatedPath(row.documentId)
  }
})
</script>

<template>
  <section v-if="relatedDocs.length" class="surface overflow-hidden">
    <div class="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
      <Link2 class="h-4 w-4 text-primary" /> Related resources
      <span class="text-xs font-normal text-muted-foreground">{{ relatedDocs.length }}</span>
    </div>
    <ul class="divide-y divide-border">
      <li v-for="row in relatedDocs" :key="row.iri" class="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
        <RouterLink
          v-if="row.documentId"
          :to="{ name: 'dataset', params: { id: row.documentId } }"
          class="min-w-0 truncate font-medium text-primary hover:underline"
          :title="row.iri"
        >
          {{ row.label }}
        </RouterLink>
        <ExternalLink
          v-else-if="isHttpUrl(row.iri)"
          :href="row.iri"
          :label="row.label"
          class="min-w-0 truncate"
          :title="row.iri"
        />
        <span v-else class="min-w-0 truncate text-muted-foreground" :title="row.iri">{{ row.label }}</span>
        <Badge variant="outline" size="sm" class="shrink-0 uppercase">{{ row.documentId ? 'in portal' : 'external' }}</Badge>
      </li>
    </ul>
  </section>
</template>
