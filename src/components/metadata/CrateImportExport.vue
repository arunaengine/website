<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Textarea from '@/components/ui/Textarea.vue'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  FileJson,
  Loader2,
  Upload,
} from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { ApiError, type MetadataDocumentSummary } from '@/lib/api'
import { crateGraph } from '@/lib/dataEntities'
import { analyzeCrateJson, type CrateImportPreview } from '@/lib/crateImport'
import { copyToClipboard } from '@/lib/utils'

const props = defineProps<{
  crate: unknown
  documentId: string
  // Write permission heuristic from the parent; the backend still enforces it.
  canImport: boolean
}>()
// The imported event carries the summary the write returned, so the host view
// can adopt the new updated_at without a second fetch.
const emit = defineEmits<{ (e: 'imported', summary: MetadataDocumentSummary): void }>()

const { profiles, saving, replaceMetadataRoCrate } = useAruna()

const showCrate = ref(false)
const importOpen = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const sectionEl = ref<HTMLElement | null>(null)
const pasteText = ref('')
const importError = ref('')
const importing = ref(false)

const pendingImport = ref<CrateImportPreview | null>(null)
const unrecognizedImportProfiles = computed(() =>
  (pendingImport.value?.conformsToIds ?? []).filter(
    (iri) => !profiles.value.some((profile) => profile.profileUri === iri || profile.graphIri === iri),
  ),
)
const importedSummary = ref<{ rootName: string; entityCount: number } | null>(null)

// The page header's dropdown opens this panel from outside; the section sits
// at the bottom of the page, so scroll it into view.
function openImport() {
  if (!props.canImport) return
  importOpen.value = true
  requestAnimationFrame(() => sectionEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

function openRaw() {
  showCrate.value = true
  requestAnimationFrame(() => sectionEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}
defineExpose({ openImport, openRaw })

// Navigating to another document resets the whole surface; stale previews must
// never replace a different crate.
watch(
  () => props.documentId,
  () => {
    showCrate.value = false
    importOpen.value = false
    pasteText.value = ''
    importError.value = ''
    pendingImport.value = null
    importedSummary.value = null
  },
)

const crateJson = computed(() => JSON.stringify(props.crate, null, 2))
const entityCount = computed(() => crateGraph(props.crate).length)
const hasCrate = computed(() => entityCount.value > 0)

const copied = ref(false)
let copyTimer: number | undefined
async function copyCrate() {
  await copyToClipboard(crateJson.value)
  copied.value = true
  window.clearTimeout(copyTimer)
  copyTimer = window.setTimeout(() => (copied.value = false), 1500)
}

function closeImport() {
  importOpen.value = false
  pendingImport.value = null
  importError.value = ''
}

function preview(text: string, source: string) {
  importError.value = ''
  importedSummary.value = null
  try {
    pendingImport.value = analyzeCrateJson(text, source)
  } catch (err) {
    pendingImport.value = null
    importError.value = err instanceof Error ? err.message : String(err)
  }
}

function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => preview(String(reader.result), file.name)
  reader.onerror = () => {
    importError.value = 'Could not read that file.'
  }
  reader.readAsText(file)
  // Reset so re-selecting the same file fires change again.
  input.value = ''
}

function previewPaste() {
  preview(pasteText.value, 'pasted JSON')
}

async function confirmImport() {
  const pending = pendingImport.value
  if (!pending || importing.value) return
  importing.value = true
  importError.value = ''
  try {
    // `public` omitted keeps the document's current visibility.
    const summary = await replaceMetadataRoCrate(props.documentId, { rocrate: pending.crate })
    importedSummary.value = { rootName: pending.rootName, entityCount: pending.entityCount }
    pendingImport.value = null
    pasteText.value = ''
    emit('imported', summary)
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) importError.value = 'You need write permission in the owning group.'
    else importError.value = err instanceof Error ? err.message : String(err)
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <section ref="sectionEl" class="surface scroll-mt-4 p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        class="inline-flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-foreground/80 hover:text-foreground"
        @click="showCrate = !showCrate"
      >
        <component :is="showCrate ? ChevronDown : ChevronRight" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Code2 class="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> RO-Crate JSON-LD (raw)
        <span v-if="hasCrate" class="text-xs font-normal text-muted-foreground">{{ entityCount }} {{ entityCount === 1 ? 'entity' : 'entities' }}</span>
      </button>
      <Button variant="ghost" size="icon-sm" :disabled="!hasCrate" aria-label="Copy JSON-LD to clipboard" title="Copy JSON-LD" @click="copyCrate">
        <Check v-if="copied" class="size-3.5 text-emerald-600 dark:text-emerald-400" />
        <Copy v-else class="size-3.5" />
      </Button>
    </div>

    <pre
      v-if="showCrate"
      class="mt-3 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-4 font-mono text-[11.5px] leading-relaxed text-foreground/85 scrollbar-thin"
    ><code>{{ crateJson }}</code></pre>

    <div v-if="importOpen && canImport" class="mt-3 space-y-3 rounded-xl border border-border bg-muted/20 p-4">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h4 class="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileJson class="h-4 w-4 text-primary" /> Import RO-Crate metadata
          </h4>
          <p class="mt-1 text-xs text-muted-foreground">
            Replace this document's crate with an <code class="font-mono">ro-crate-metadata.json</code> file. The import is previewed and confirmed before anything is written.
          </p>
        </div>
        <Button variant="ghost" size="sm" class="shrink-0" @click="closeImport">Close</Button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <input ref="fileInput" type="file" accept="application/json,application/ld+json,.json,.jsonld" class="hidden" @change="onFile" />
        <Button type="button" variant="outline" size="sm" @click="fileInput?.click()">
          <Upload class="size-3.5" /> Upload file
        </Button>
        <span class="text-[11px] text-muted-foreground">or paste the JSON-LD below</span>
      </div>

      <div class="space-y-2">
        <Textarea v-model="pasteText" rows="6" class="font-mono text-xs" spellcheck="false" placeholder='{ "@context": "https://w3id.org/ro/crate/1.1/context", "@graph": [ … ] }' />
        <Button type="button" variant="outline" size="sm" :disabled="!pasteText.trim()" @click="previewPaste">Preview pasted JSON</Button>
      </div>

      <div v-if="importError" class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{{ importError }}</span>
      </div>

      <div v-if="pendingImport" class="space-y-2 rounded-md border border-border bg-card px-3 py-2 text-xs">
        <div class="flex items-center gap-2 font-medium text-foreground">
          <FileJson class="h-3.5 w-3.5 shrink-0 text-primary" />
          {{ pendingImport.source }}: {{ pendingImport.rootName }}
        </div>
        <p class="text-muted-foreground">
          {{ pendingImport.entityCount }} {{ pendingImport.entityCount === 1 ? 'entity' : 'entities' }} in the graph,
          {{ pendingImport.fileCount }} referenced data {{ pendingImport.fileCount === 1 ? 'file' : 'files' }}.
        </p>
        <div v-if="unrecognizedImportProfiles.length" class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-800 dark:text-amber-300">
          <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This crate declares conformance to {{ unrecognizedImportProfiles.length === 1 ? 'a profile that is' : 'profiles that are' }} not yet recognized:
            <code class="break-all font-mono">{{ unrecognizedImportProfiles.join(', ') }}</code>. You can still import it.
          </span>
        </div>
        <div class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-800 dark:text-amber-300">
          <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Importing replaces this document's current metadata, every field and file reference. This cannot be undone.</span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button type="button" variant="destructive" size="sm" :disabled="importing || saving" @click="confirmImport">
            <Loader2 v-if="importing" class="size-3.5 animate-spin" />
            <template v-else>Replace metadata</template>
          </Button>
          <Button type="button" variant="ghost" size="sm" :disabled="importing" @click="pendingImport = null">Cancel</Button>
        </div>
      </div>

      <div v-if="importedSummary" class="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
        <div class="flex items-center gap-2 font-medium">
          <CheckCircle2 class="h-3.5 w-3.5" />
          Imported {{ importedSummary.rootName }} ({{ importedSummary.entityCount }} {{ importedSummary.entityCount === 1 ? 'entity' : 'entities' }}).
        </div>
        <p class="mt-1">The catalog projection may briefly lag while the new crate materializes.</p>
      </div>
    </div>
  </section>
</template>
