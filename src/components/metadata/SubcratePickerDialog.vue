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
import { Check, Layers, Loader2 } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import type { MetadataDocumentListItem } from '@/lib/api'

// Catalog picker for subcrate linking, shared by the detail page's Subcrates
// section and the create/edit metadata dialogs. Selection is emitted; the host
// owns the actual crate write (which may be async — `busy`/`error` reflect it).
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

const { metadata, metadataItems } = useAruna()

const filter = ref('')
const selected = ref<Set<string>>(new Set())

watch(
  () => props.open,
  (open) => {
    if (!open) return
    filter.value = ''
    selected.value = new Set()
  },
)

function titleOf(item: MetadataDocumentListItem): string {
  return metadata.value.find((doc) => doc.ulid === item.document_id)?.title || item.document_path
}

const candidates = computed(() => {
  const query = filter.value.trim().toLowerCase()
  const excluded = new Set(props.excludedIris ?? [])
  return metadataItems.value.filter((item) => {
    if (item.document_id === props.excludeDocumentId || !item.graph_iri) return false
    if (excluded.has(item.graph_iri)) return false
    if (!query) return true
    return titleOf(item).toLowerCase().includes(query) || item.document_path.toLowerCase().includes(query)
  })
})

function toggle(documentId: string) {
  const next = new Set(selected.value)
  if (next.has(documentId)) next.delete(documentId)
  else next.add(documentId)
  selected.value = next
}

function confirm() {
  const items = [...selected.value]
    .map((documentId) => metadataItems.value.find((item) => item.document_id === documentId))
    .filter((item): item is MetadataDocumentListItem => Boolean(item))
  if (items.length) emit('select', items)
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

      <Input v-model="filter" placeholder="Filter by title or path" />

      <div class="max-h-72 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
        <button
          v-for="item in candidates"
          :key="item.document_id"
          type="button"
          class="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors"
          :class="selected.has(item.document_id) ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40'"
          @click="toggle(item.document_id)"
        >
          <span class="min-w-0">
            <span class="block truncate font-medium text-foreground">{{ titleOf(item) }}</span>
            <span class="block truncate font-mono text-[11px] text-muted-foreground">{{ item.document_path }}</span>
          </span>
          <Check v-if="selected.has(item.document_id)" class="h-4 w-4 shrink-0 text-primary" />
        </button>
        <p v-if="!candidates.length" class="px-1 py-4 text-center text-xs text-muted-foreground">
          {{ filter.trim() ? 'No documents match the filter.' : 'Every other catalog document is already linked (or none exist yet).' }}
        </p>
      </div>

      <p v-if="error" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ error }}</p>

      <DialogFooter>
        <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!selected.size || busy" @click="confirm">
          <Loader2 v-if="busy" class="size-3.5 animate-spin" />
          <template v-else>Link {{ selected.size || '' }} {{ selected.size === 1 ? 'subcrate' : 'subcrates' }}</template>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
