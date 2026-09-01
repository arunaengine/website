<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import { Layers, Pencil } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import type { MetadataDocumentListItem } from '@/lib/api'
import { isProjectCrate, subcrateLinksOf, type SubcrateLink } from '@/lib/subcrates'
import { documentIdFromIri, isDocumentId } from '@/lib/graphIri'
import { isHttpUrl } from '@/lib/utils'

// What this dataset links, shown only. Parts are edited in one place, the
// dataset editor, so no second writer of hasPart exists.
const props = defineProps<{
  crate: unknown
  documentId: string
  canWrite: boolean
}>()

const { toMetadataDoc, metadataItems, getMetadataItem } = useAruna()

const links = computed(() => subcrateLinksOf(props.crate))
const isProject = computed(() => isProjectCrate(props.crate))

// In-portal resolution is a pure decision on the link itself: the identifier
// (a document id) wins, the Aruna graph IRI is the fallback; anything else
// renders as an external entry, never an error.
function resolveDocumentId(link: SubcrateLink): string | undefined {
  if (link.identifier && isDocumentId(link.identifier)) return link.identifier
  return documentIdFromIri(link.iri) ?? undefined
}

function titleOf(item: MetadataDocumentListItem): string {
  return toMetadataDoc(item).title
}

// A stored subcrate stub freezes the child's name at link time. Resolve the
// display name from the live document instead, so a renamed child shows its
// current title; the stored stub stays untouched as the offline fallback.
const liveNames = ref<Record<string, string>>({})
watch(
  links,
  (entries) => {
    for (const link of entries) {
      const documentId = resolveDocumentId(link)
      if (!documentId || liveNames.value[documentId] !== undefined) continue
      const listed = metadataItems.value.find((item) => item.document_id === documentId)
      if (listed) {
        liveNames.value = { ...liveNames.value, [documentId]: titleOf(listed) }
        continue
      }
      getMetadataItem(documentId)
        .then((item) => {
          liveNames.value = { ...liveNames.value, [documentId]: titleOf(item) }
        })
        .catch(() => undefined)
    }
  },
  { immediate: true },
)

function displayName(link: SubcrateLink): string {
  const documentId = resolveDocumentId(link)
  return (documentId && liveNames.value[documentId]) || link.name
}
</script>

<template>
  <section class="surface overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
      <div class="flex items-center gap-2 text-sm font-medium text-foreground">
        <Layers class="h-4 w-4 text-primary" /> Linked datasets
        <span v-if="links.length" class="text-xs font-normal text-muted-foreground">{{ links.length }}</span>
        <Badge v-if="isProject" variant="outline" size="sm" class="uppercase">Project dataset</Badge>
      </div>
      <Button v-if="canWrite" as-child variant="outline" size="sm">
        <RouterLink :to="{ name: 'dataset-edit', params: { id: documentId } }">
          <Pencil class="size-3.5" /> Edit
        </RouterLink>
      </Button>
    </div>

    <ul v-if="links.length" class="divide-y divide-border">
      <li v-for="link in links" :key="link.iri" class="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
        <div class="flex min-w-0 items-center gap-2.5">
          <Layers class="h-4 w-4 shrink-0 text-muted-foreground" />
          <div class="min-w-0">
            <RouterLink
              v-if="resolveDocumentId(link)"
              :to="{ name: 'dataset', params: { id: resolveDocumentId(link) } }"
              class="block truncate font-medium text-primary hover:underline"
              :title="link.iri"
            >
              {{ displayName(link) }}
            </RouterLink>
            <ExternalLink v-else-if="isHttpUrl(link.iri)" :href="link.iri" :label="link.name" class="block truncate font-medium" :title="link.iri" />
            <span v-else class="block truncate font-medium text-foreground" :title="link.iri">{{ link.name }}</span>
            <span class="block truncate font-mono text-[11px] text-muted-foreground" :title="link.identifier || link.iri">{{ link.identifier || link.iri }}</span>
          </div>
        </div>
        <Badge variant="outline" size="sm" class="uppercase">{{ resolveDocumentId(link) ? 'linked' : 'external' }}</Badge>
      </li>
    </ul>
    <EmptyState
      v-else
      compact
      title="No datasets linked yet."
      description="Link existing datasets in the editor to make this a project-level dataset that groups them."
    />
  </section>
</template>
