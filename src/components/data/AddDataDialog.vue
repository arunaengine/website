<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { ref } from 'vue'
import {
  Upload,
  Link2,
  Globe,
  Boxes,
  Folder,
} from 'lucide-vue-next'

const props = defineProps<{ open: boolean; bucketName?: string }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
}>()

type Mode = 'upload' | 'reference'
const mode = ref<Mode>('upload')

// Reference mode state
type Source = 'http' | 's3' | 'aruna'
const source = ref<Source>('http')
const url = ref('')
const targetPath = ref('')

const sources: { id: Source; label: string; icon: unknown; placeholder: string; help: string }[] = [
  {
    id: 'http',
    label: 'Public URL',
    icon: Globe,
    placeholder: 'https://example.org/datasets/file.csv',
    help: 'Any HTTP or HTTPS URL. The file is fetched on demand the first time it is accessed.',
  },
  {
    id: 's3',
    label: 'S3 endpoint',
    icon: Boxes,
    placeholder: 's3://bucket/path/to/file.parquet',
    help: 'An S3-compatible source. You will be asked for credentials separately.',
  },
  {
    id: 'aruna',
    label: 'Another bucket',
    icon: Folder,
    placeholder: 'aruna://realm/group/bucket/key',
    help: 'A bucket on this or another Aruna node — no copy, just a reference.',
  },
]

function reset() {
  mode.value = 'upload'
  url.value = ''
  targetPath.value = ''
  source.value = 'http'
}

function close() {
  emit('update:open', false)
  reset()
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Upload class="h-4 w-4 text-primary" /> Add data
        </DialogTitle>
        <DialogDescription>
          <template v-if="props.bucketName">
            Add files to <span class="font-medium text-foreground">{{ props.bucketName }}</span>.
          </template>
          <template v-else>
            Add files to this bucket.
          </template>
          You can upload from your computer or reference data that lives elsewhere.
        </DialogDescription>
      </DialogHeader>

      <div class="-mb-px flex border-b border-border">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors"
          :class="
            mode === 'upload'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          "
          @click="mode = 'upload'"
        >
          <Upload class="h-3.5 w-3.5" /> Upload
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors"
          :class="
            mode === 'reference'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          "
          @click="mode = 'reference'"
        >
          <Link2 class="h-3.5 w-3.5" /> Reference remote
        </button>
      </div>

      <div v-if="mode === 'upload'" class="space-y-3 pt-2">
        <label
          class="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 p-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <Upload class="h-6 w-6 text-primary" />
          <div class="text-sm font-medium text-foreground">
            Drop files here or click to browse
          </div>
          <div class="text-[11px] text-muted-foreground">
            Files are stored in this bucket. Up to 5 GB per file in the browser.
          </div>
          <input type="file" multiple class="hidden" />
        </label>
        <div>
          <label class="text-xs font-medium text-foreground">Target folder (optional)</label>
          <Input v-model="targetPath" placeholder="raw/2025-04/" class="mt-1" />
        </div>
      </div>

      <div v-else class="space-y-4 pt-2">
        <div class="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-foreground/80">
          <Link2 class="mr-1 inline h-3 w-3 text-amber-600" />
          Referenced files appear in this bucket but the bytes stay at the source.
          They show a <span class="font-medium text-amber-700 dark:text-amber-400">reference</span> badge.
        </div>

        <div>
          <label class="text-xs font-medium text-foreground">Where is the data?</label>
          <div class="mt-2 grid gap-2 sm:grid-cols-3">
            <button
              v-for="s in sources"
              :key="s.id"
              type="button"
              class="flex flex-col items-start gap-1 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/40"
              :class="source === s.id ? 'border-primary/60 ring-1 ring-primary/30' : ''"
              @click="source = s.id"
            >
              <component :is="s.icon" class="h-4 w-4 text-primary" />
              <span class="text-sm font-medium text-foreground">{{ s.label }}</span>
            </button>
          </div>
          <p class="mt-2 text-[11px] text-muted-foreground">
            {{ sources.find((s) => s.id === source)?.help }}
          </p>
        </div>

        <div>
          <label class="text-xs font-medium text-foreground">Source URL</label>
          <Input
            v-model="url"
            :placeholder="sources.find((s) => s.id === source)?.placeholder"
            class="mt-1 font-mono text-[12px]"
          />
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Target name (optional)</label>
          <Input
            v-model="targetPath"
            placeholder="cohort-2024.parquet"
            class="mt-1"
          />
          <p class="mt-1 text-[11px] text-muted-foreground">
            How this file appears inside your bucket. Leave blank to use the source name.
          </p>
        </div>
      </div>

      <DialogFooter>
        <DialogClose>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button
          :disabled="mode === 'reference' && !url"
          @click="close"
        >
          {{ mode === 'upload' ? 'Upload' : 'Add reference' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
