<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import SubcratePickerDialog from '@/components/metadata/SubcratePickerDialog.vue'
import { Layers, Plus, X } from '@lucide/vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import { ApiError, type MetadataDocumentListItem, type MetadataDocumentSummary } from '@/lib/api'
import { addSubcrateLink, isProjectCrate, removeSubcrateLink, subcrateLinksOf, type SubcrateLink } from '@/lib/subcrates'
import { documentIdFromIri, isDocumentId } from '@/lib/graphIri'
import { errorMessage, isHttpUrl } from '@/lib/utils'

const props = defineProps<{
  // The displayed (resolved) crate; writes always go through a fresh raw fetch.
  crate: unknown
  documentId: string
  canWrite: boolean
}>()
// The changed event carries the summary the write returned, so the host view
// can adopt the new updated_at without a second fetch.
const emit = defineEmits<{ (e: 'changed', summary: MetadataDocumentSummary): void }>()

const { toMetadataDoc, apiBaseUrl, saving, fetchRoCrateRaw, replaceMetadataRoCrate, metadataItems, getMetadataItem } = useAruna()

// The spec's subjectOf fallback needs a URL that resolves to the child's crate
// JSON; the portal serves it at GET /metadata/{id}/rocrate.
function crateJsonUrl(documentId: string): string {
  return `${apiBaseUrl.value.replace(/\/+$/, '')}/metadata/${encodeURIComponent(documentId)}/rocrate`
}

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

const error = ref<string | null>(null)
const busy = ref(false)
const removingIri = ref<string | null>(null)

// ── Picker (shared SubcratePickerDialog; this section owns the crate write) ──
const pickerOpen = ref(false)
const linkedIris = computed(() => links.value.map((link) => link.iri))

function openPicker() {
  error.value = null
  pickerOpen.value = true
}

async function linkSelected(items: MetadataDocumentListItem[]) {
  if (!items.length || busy.value) return
  busy.value = true
  error.value = null
  try {
    // Always mutate a fresh RAW crate: the displayed crate may carry resolved
    // artifacts that must never be written back.
    const clone = structuredClone(await fetchRoCrateRaw(props.documentId)) as unknown
    for (const item of items) {
      addSubcrateLink(clone, {
        iri: item.graph_iri,
        name: titleOf(item),
        identifier: item.document_id,
        subjectOf: crateJsonUrl(item.document_id),
      })
    }
    const summary = await replaceMetadataRoCrate(props.documentId, { rocrate: clone })
    pickerOpen.value = false
    emit('changed', summary)
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) error.value = 'You need write permission in the owning group.'
    else error.value = errorMessage(err)
  } finally {
    busy.value = false
  }
}

async function unlink(link: SubcrateLink) {
  if (removingIri.value) return
  removingIri.value = link.iri
  error.value = null
  try {
    const clone = structuredClone(await fetchRoCrateRaw(props.documentId)) as unknown
    removeSubcrateLink(clone, link.iri)
    const summary = await replaceMetadataRoCrate(props.documentId, { rocrate: clone })
    emit('changed', summary)
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) error.value = 'You need write permission in the owning group.'
    else error.value = errorMessage(err)
  } finally {
    removingIri.value = null
  }
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
      <Button v-if="canWrite" variant="outline" size="sm" @click="openPicker"><Plus class="size-3.5" /> Link dataset</Button>
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
        <div class="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline" size="sm" class="uppercase">{{ resolveDocumentId(link) ? 'linked' : 'external' }}</Badge>
          <Button
            v-if="canWrite"
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground hover:text-destructive"
            :disabled="removingIri !== null || saving"
            :aria-label="`Unlink ${link.name}`"
            title="Unlink (the child dataset itself is kept)"
            @click="unlink(link)"
          >
            <Spinner v-if="removingIri === link.iri" class="text-current" aria-hidden="true" />
            <X v-else class="size-3.5" />
          </Button>
        </div>
      </li>
    </ul>
    <EmptyState
      v-else
      compact
      title="No datasets linked yet."
      description="Link existing datasets to make this a project-level dataset that groups them."
    />
    <p v-if="error" class="border-t border-border px-5 py-2.5 text-xs text-destructive">{{ error }}</p>

    <SubcratePickerDialog
      v-model:open="pickerOpen"
      :excluded-iris="linkedIris"
      :exclude-document-id="documentId"
      :busy="busy || saving"
      :error="error"
      @select="linkSelected"
    />
  </section>
</template>
