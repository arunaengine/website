<script setup lang="ts">
// One Browse entry point. Where the File System Access API exists it opens a
// menu offering files or a whole folder; everywhere else it opens the multi
// file input and a quiet link picks a folder when the input supports one.
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { collectDropFiles } from '@/lib/upload/dropEntries'
import { pickFiles, pickFolder, pickersSupported } from '@/lib/upload/pickers'
import { ref } from 'vue'
import { ChevronDown, Files, FolderInput, UploadCloud } from '@lucide/vue'

const emit = defineEmits<{ (e: 'add', files: File[]): void }>()

const { writesDisabled } = useConnectivity()

const dragActive = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)

const pickers = pickersSupported()
const folderInputSupported =
  typeof HTMLInputElement !== 'undefined' && 'webkitdirectory' in HTMLInputElement.prototype

function add(files: File[]) {
  if (!writesDisabled.value && files.length) emit('add', files)
}

function onBrowse(event: Event) {
  const input = event.target as HTMLInputElement
  add(Array.from(input.files ?? []))
  input.value = ''
}

async function pick(kind: 'files' | 'folder') {
  if (writesDisabled.value) return
  try {
    add(kind === 'files' ? await pickFiles() : await pickFolder())
  } catch {
    // A cancelled picker is not a failure.
  }
}

async function onDrop(event: DragEvent) {
  dragActive.value = false
  if (writesDisabled.value) return
  add(await collectDropFiles(event.dataTransfer))
}
</script>

<template>
  <div
    class="rounded-md border-2 border-dashed p-8 text-center transition-colors"
    :class="dragActive ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-2' : 'border-border'"
    @dragover.prevent="dragActive = true"
    @dragleave="dragActive = false"
    @drop.prevent="onDrop"
  >
    <UploadCloud class="mx-auto h-8 w-8 text-muted-foreground" />
    <p class="mt-2 text-sm text-foreground">Drop files or folders here to add them to the basket</p>
    <p class="mt-1 text-xs text-muted-foreground">or</p>
    <input ref="fileInput" type="file" multiple class="hidden" @change="onBrowse" />
    <input
      v-if="folderInputSupported"
      ref="folderInput"
      type="file"
      webkitdirectory
      class="hidden"
      @change="onBrowse"
    />
    <div class="mt-2 flex items-center justify-center">
      <DropdownMenu v-if="pickers">
        <DropdownMenuTrigger as-child>
          <Button
            variant="outline"
            size="sm"
            :disabled="writesDisabled"
            :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          >
            <FolderInput class="h-3.5 w-3.5" /> Browse <ChevronDown class="h-3.5 w-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" class="w-44">
          <DropdownMenuItem class="cursor-pointer" @click="pick('files')">
            <Files class="h-3.5 w-3.5 text-primary" /> Files
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @click="pick('folder')">
            <FolderInput class="h-3.5 w-3.5 text-primary" /> Folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        v-else
        variant="outline"
        size="sm"
        :disabled="writesDisabled"
        :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
        @click="fileInput?.click()"
      >
        <FolderInput class="h-3.5 w-3.5" /> Browse
      </Button>
    </div>
    <button
      v-if="!pickers && folderInputSupported"
      type="button"
      class="mt-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      :disabled="writesDisabled"
      @click="folderInput?.click()"
    >
      …or pick a whole folder
    </button>
  </div>
  <p class="text-[11px] text-muted-foreground">
    Uploads are multipart (16 MiB parts), run up to three at a time, and keep going while you navigate.
    A picked or dropped folder keeps its structure under the target prefix.
  </p>
</template>
