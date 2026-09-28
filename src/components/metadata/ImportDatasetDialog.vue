<script setup lang="ts">
// One entry point for new datasets from elsewhere: an RO-Crate archive or a
// repository record. Each source keeps its own flow and state while switching
// and while the dialog is closed.
import { computed, ref, watch } from 'vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import CrateImportPanel from '@/components/metadata/CrateImportPanel.vue'
import RepositoryImportPanel from '@/components/metadata/RepositoryImportPanel.vue'
import { useRepositoryKinds } from '@/composables/useRepository'
import { Import } from '@lucide/vue'

type Source = 'archive' | 'repository'

const open = defineModel<boolean>('open', { required: true })

// The repository card hides only once the node said no kind can import.
const { kinds } = useRepositoryKinds()
const repositoryAvailable = computed(() => kinds.value === null || kinds.value.some((kind) => kind.capabilities.import))

const sources = computed(() => [
  { value: 'archive' as const, title: 'RO-Crate archive', text: 'Upload a .zip or .eln file from your computer.' },
  ...(repositoryAvailable.value
    ? [{ value: 'repository' as const, title: 'From a repository', text: 'Find a record in Zenodo or another linked repository, optionally keep it updated.' }]
    : []),
])
const source = ref<Source>('archive')
// The dialog content unmounts when closed; the panels wait in a hidden holder.
const panelHost = ref<HTMLElement | null>(null)
watch(repositoryAvailable, (available) => {
  if (!available) source.value = 'archive'
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[88vh] max-w-2xl flex-col">
      <DialogHeader class="pr-8">
        <DialogTitle class="flex items-center gap-2"><Import class="h-4 w-4 text-primary" /> Import a dataset</DialogTitle>
        <DialogDescription>Choose where the dataset comes from.</DialogDescription>
      </DialogHeader>
      <div role="radiogroup" aria-label="Source" class="grid gap-3 sm:grid-cols-2">
        <button
          v-for="entry in sources"
          :key="entry.value"
          type="button"
          role="radio"
          :aria-checked="source === entry.value"
          class="rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :class="source === entry.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/40'"
          @click="source = entry.value"
        >
          <span class="block text-sm font-medium text-foreground">{{ entry.title }}</span>
          <span class="mt-1 block text-xs text-muted-foreground">{{ entry.text }}</span>
        </button>
      </div>
      <div ref="panelHost" class="flex min-h-0 flex-1 flex-col" />
    </DialogContent>
  </Dialog>
  <div hidden>
    <Teleport :to="panelHost" :disabled="!panelHost">
      <CrateImportPanel v-show="source === 'archive'" :active="open && source === 'archive'" @close="open = false" />
      <RepositoryImportPanel
        v-if="repositoryAvailable"
        v-show="source === 'repository'"
        :active="open && source === 'repository'"
        @close="open = false"
      />
    </Teleport>
  </div>
</template>
