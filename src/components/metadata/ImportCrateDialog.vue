<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, FileJson, FileJson2, Upload } from '@lucide/vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DiscardDraftConfirm from '@/components/ui/DiscardDraftConfirm.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { profileReferenceIri, useAruna } from '@/composables/useAruna'
import { analyzeCrateJson, type CrateImportPreview } from '@/lib/crateImport'
import type { DatasetDraft } from '@/lib/crate/build'
import { parseDatasetDraft } from '@/lib/crate/parse'
import { slugify } from '@/lib/profiles/emit'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'imported', draft: DatasetDraft): void
}>()

const { profiles } = useAruna()
const importFileInput = ref<HTMLInputElement | null>(null)
const importPaste = ref('')
const importError = ref('')
const importPreview = ref<CrateImportPreview | null>(null)
const confirmDiscardOpen = ref(false)

const unrecognizedImportProfiles = computed(() =>
  (importPreview.value?.conformsToIds ?? []).filter(
    (iri) => !profiles.value.some(
      (profile) => profileReferenceIri(profile) === iri || profile.profileUri === iri || profile.graphIri === iri,
    ),
  ),
)

function importPreviewFrom(text: string, source: string) {
  importError.value = ''
  try {
    importPreview.value = analyzeCrateJson(text, source)
  } catch (error) {
    importPreview.value = null
    importError.value = errorMessage(error)
  }
}

function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => importPreviewFrom(String(reader.result), file.name)
  reader.onerror = () => {
    importError.value = 'Could not read that file.'
  }
  reader.readAsText(file)
  input.value = ''
}

function useCrate() {
  const pending = importPreview.value
  if (!pending) return
  emit('imported', parseDatasetDraft(pending.crate, {
    path: `datasets/${slugify(pending.rootName) || 'imported-crate'}`,
  }))
  emit('update:open', false)
}

const hasDraftProgress = computed(() => Boolean(importPaste.value.trim() || importPreview.value))

function requestClose(open: boolean) {
  if (open) {
    emit('update:open', true)
  } else if (hasDraftProgress.value) {
    confirmDiscardOpen.value = true
  } else {
    emit('update:open', false)
  }
}

function discardDraft() {
  confirmDiscardOpen.value = false
  emit('update:open', false)
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    importPaste.value = ''
    importError.value = ''
    importPreview.value = null
    confirmDiscardOpen.value = false
  },
  { immediate: true },
)
</script>

<template>
  <Dialog :open="props.open" @update:open="requestClose">
    <DialogContent class="max-w-xl" @interact-outside="(event: Event) => event.preventDefault()">
      <div class="contents" :inert="confirmDiscardOpen">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <FileJson2 class="h-4 w-4 text-primary" /> Import RO-Crate
          </DialogTitle>
          <DialogDescription>
            Preview JSON-LD and use it to prefill this new dataset draft.
          </DialogDescription>
        </DialogHeader>

        <div class="max-h-[70vh] space-y-4 overflow-y-auto px-1 scrollbar-thin">
          <p class="text-xs text-muted-foreground">
            Upload or paste an existing <code class="font-mono">ro-crate-metadata.json</code>. Nothing is created until you review and save the draft.
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <input ref="importFileInput" type="file" accept="application/json,application/ld+json,.json,.jsonld" class="hidden" @change="onImportFile" />
            <Button type="button" variant="outline" size="sm" @click="importFileInput?.click()">
              <Upload class="size-3.5" /> Upload file
            </Button>
            <span class="text-[11px] text-muted-foreground">or paste the JSON-LD below</span>
          </div>
          <div class="space-y-2">
            <Textarea v-model="importPaste" rows="6" class="font-mono text-xs" spellcheck="false" placeholder='{ "@context": "https://w3id.org/ro/crate/1.1/context", "@graph": [ … ] }' />
            <Button type="button" variant="outline" size="sm" :disabled="!importPaste.trim()" @click="importPreviewFrom(importPaste, 'pasted JSON')">Preview pasted JSON</Button>
          </div>
          <Notice v-if="importError" tone="error" class="flex items-start gap-2">
            <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{{ importError }}</span>
          </Notice>
          <template v-if="importPreview">
            <div class="space-y-2 rounded-md border border-border bg-card px-3 py-2 text-xs">
              <div class="flex items-center gap-2 font-medium text-foreground">
                <FileJson class="h-3.5 w-3.5 shrink-0 text-primary" />
                {{ importPreview.source }}: {{ importPreview.rootName }}
                <span v-if="importPreview.specVersion" class="ml-auto shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  RO-Crate {{ importPreview.specVersion }}
                </span>
              </div>
              <p class="text-muted-foreground">
                {{ importPreview.entityCount }} {{ importPreview.entityCount === 1 ? 'entity' : 'entities' }} in the graph,
                {{ importPreview.fileCount }} referenced data {{ importPreview.fileCount === 1 ? 'file' : 'files' }}.
              </p>
            </div>
            <Notice v-if="importPreview.unknownSpecVersion" tone="warning" class="flex items-start gap-2">
              <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>RO-Crate {{ importPreview.unknownSpecVersion }} is not recognized by this portal. The node may reject this dataset.</span>
            </Notice>
            <Notice v-if="unrecognizedImportProfiles.length" tone="warning" class="flex items-start gap-2">
              <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This dataset declares conformance to {{ unrecognizedImportProfiles.length === 1 ? 'a profile that is' : 'profiles that are' }} not yet recognized:
                <code class="break-all font-mono">{{ unrecognizedImportProfiles.join(', ') }}</code>. The reference stays in the draft, but the backend may reject it until the Profile is registered.
              </span>
            </Notice>
          </template>
        </div>

        <DialogFooter>
          <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
          <Button :disabled="!importPreview" @click="useCrate">Use this RO-Crate</Button>
        </DialogFooter>
      </div>

      <DiscardDraftConfirm :open="confirmDiscardOpen" @keep="confirmDiscardOpen = false" @discard="discardDraft" />
    </DialogContent>
  </Dialog>
</template>
