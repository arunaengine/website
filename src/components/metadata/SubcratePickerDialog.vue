<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { Check, Layers, Loader2 } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useMetadataSearch } from '@/composables/useMetadataSearch'
import { graphIriFor } from '@/lib/graphIri'
import type { MetadataDocumentListItem } from '@/lib/api'

// Catalog picker for subcrate linking, shared by the detail page's Subcrates
// section and the create/edit metadata dialogs. Selection is emitted; the host
// owns the actual crate write (which may be async; `busy`/`error` reflect it).
const props = defineProps<{
  open: boolean
  // Graph IRIs already linked; hidden from the candidate list.
  excludedIris?: string[]
  // The host document itself (never a candidate). Absent in the create flow.
  excludeDocumentId?: string
  busy?: boolean
  error?: string | null
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'select', items: MetadataDocumentListItem[]): void
}>()

const { metadataItems, toMetadataDoc, getMetadataItem } = useAruna()

const filter = ref('')
const selected = ref<Set<string>>(new Set())
const resolving = ref(false)
const resolveError = ref<string | null>(null)

// Typing searches the whole realm server-side; the empty-query state lists the
// catalog pages already loaded (the realm is far too large to enumerate).
const { results: searchResults, pending: searching, error: searchError } = useMetadataSearch(filter)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    filter.value = ''
    selected.value = new Set()
    resolveError.value = null
  },
)

interface Candidate {
  documentId: string
  graphIri: string
  path: string
  title: string
}

function toCandidate(item: MetadataDocumentListItem): Candidate {
  return {
    documentId: item.document_id,
    graphIri: item.graph_iri,
    path: item.document_path,
    title: toMetadataDoc(item).title,
  }
}

const searchable = computed(() => filter.value.trim().length >= 2)

const candidates = computed<Candidate[]>(() => {
  const excluded = new Set(props.excludedIris ?? [])
  const rows = searchable.value
    ? searchResults.value.map((line) => ({
        documentId: line.hit.document_id,
        graphIri: line.hit.graph_iri || graphIriFor(line.hit.document_id),
        path: line.hit.document_path,
        title: line.title || line.hit.document_path,
      }))
    : metadataItems.value.map(toCandidate)
  return rows.filter(
    (row) => row.documentId !== props.excludeDocumentId && row.graphIri && !excluded.has(row.graphIri),
  )
})

function toggle(documentId: string) {
  const next = new Set(selected.value)
  if (next.has(documentId)) next.delete(documentId)
  else next.add(documentId)
  selected.value = next
}

// A selected hit is usually outside the loaded pages, so unknown ids are
// resolved with a targeted fetch before the host writes the crate.
async function confirm() {
  if (!selected.value.size || resolving.value) return
  resolveError.value = null
  resolving.value = true
  try {
    const items = await Promise.all(
      [...selected.value].map(async (documentId) => {
        const loaded = metadataItems.value.find((item) => item.document_id === documentId)
        return loaded ?? (await getMetadataItem(documentId))
      }),
    )
    emit('select', items)
  } catch (err) {
    resolveError.value = err instanceof Error ? err.message : String(err)
  } finally {
    resolving.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2"><Layers class="h-4 w-4 text-primary" /> Link subcrates</DialogTitle>
        <DialogDescription>
          Reference other metadata crates as parts of this one. Linked crates stay independent documents; this crate only points at them and becomes a project-level Collection.
        </DialogDescription>
      </DialogHeader>

      <div class="relative">
        <Input v-model="filter" :aria-busy="searching" placeholder="Search the realm by title or path" class="pr-9" />
        <Spinner v-if="searching" label="Searching the realm…" class="absolute right-3 top-1/2 -translate-y-1/2 text-primary" />
      </div>

      <div
        class="max-h-72 space-y-1 overflow-y-auto pr-1 transition-opacity scrollbar-thin"
        :class="searching && candidates.length ? 'opacity-40' : ''"
        :aria-busy="searching"
      >
        <button
          v-for="item in candidates"
          :key="item.documentId"
          type="button"
          class="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors"
          :class="selected.has(item.documentId) ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40'"
          @click="toggle(item.documentId)"
        >
          <span class="min-w-0">
            <span class="block truncate font-medium text-foreground">{{ item.title }}</span>
            <span class="block truncate font-mono text-[11px] text-muted-foreground">{{ item.path }}</span>
          </span>
          <Check v-if="selected.has(item.documentId)" class="h-4 w-4 shrink-0 text-primary" />
        </button>
        <p v-if="searching && !candidates.length" class="px-1 py-4 text-center text-xs text-muted-foreground">Searching…</p>
        <p v-else-if="!candidates.length" class="px-1 py-4 text-center text-xs text-muted-foreground">
          {{ searchable ? 'No documents match the search.' : 'Type at least two characters to search the realm.' }}
        </p>
      </div>
      <p v-if="!searchable" class="text-[11px] text-muted-foreground">
        Showing the catalog pages loaded so far. Search to reach every document in the realm.
      </p>

      <p v-if="searchError || resolveError || error" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        {{ searchError || resolveError || error }}
      </p>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!selected.size || busy || resolving" @click="confirm">
          <Loader2 v-if="busy || resolving" class="size-3.5 animate-spin" />
          <template v-else>Link {{ selected.size || '' }} {{ selected.size === 1 ? 'subcrate' : 'subcrates' }}</template>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
