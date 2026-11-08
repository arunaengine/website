<script setup lang="ts">
// The files of a share link, one folder at a time with breadcrumbs inside the shared root, a
// Download per file and, for upload links, the upload area for the folder on screen.
import { computed, ref, watch } from 'vue'
import { ChevronRight, Download, File as FileIcon, Folder } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import ListPager from '@/components/ui/ListPager.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Spinner from '@/components/ui/Spinner.vue'
import VisitUpload from '@/components/shares/VisitUpload.vue'
import { isUnavailable, listFailure } from '@/composables/useShareVisit'
import { listVisitFiles, ticketUrl, visitTicket, type VisitFile } from '@/lib/api'
import { errorMessage, formatBytes, formatDateTime } from '@/lib/utils'

type Visit = <T>(call: (token: string, base: string) => Promise<T>) => Promise<T>

const props = defineProps<{ visit: Visit; rootName: string; uploads: boolean }>()

const prefix = ref('')
const folders = ref<string[]>([])
const files = ref<VisitFile[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const page = ref(1)
const pageSize = ref(10)

interface Entry {
  name: string
  folder: boolean
  file?: VisitFile
}
const entries = computed<Entry[]>(() => [
  ...folders.value.map((name) => ({ name, folder: true })),
  ...files.value.map((file) => ({ name: file.name, folder: false, file })),
])
const shown = computed(() => entries.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

const crumbs = computed(() => {
  const parts = prefix.value.split('/').filter(Boolean)
  return parts.map((part, index) => ({ label: part, prefix: `${parts.slice(0, index + 1).join('/')}/` }))
})

const leaf = (name: string) => name.replace(/\/$/, '').split('/').at(-1) ?? name

let generation = 0
async function load() {
  const run = ++generation
  loading.value = true
  error.value = null
  try {
    const found = { folders: [] as string[], files: [] as VisitFile[] }
    let cursor: string | undefined
    do {
      const pageOf = await props.visit((token, base) => listVisitFiles({ prefix: prefix.value || undefined, cursor, limit: 1000 }, token, base))
      if (run !== generation) return
      found.folders.push(...pageOf.folders)
      found.files.push(...pageOf.files)
      cursor = pageOf.next_cursor ?? undefined
    } while (cursor)
    folders.value = found.folders
    files.value = found.files
  } catch (cause) {
    if (run === generation && !isUnavailable(cause)) error.value = listFailure(cause)
  } finally {
    if (run === generation) loading.value = false
  }
}

watch(prefix, () => {
  page.value = 1
  void load()
}, { immediate: true })

const downloading = ref<string | null>(null)
async function download(name: string) {
  downloading.value = name
  error.value = null
  try {
    // A ticket is single use and short lived, so each click asks for a new one.
    const url = await props.visit(async (token, base) => ticketUrl(base, (await visitTicket(name, token, base)).path))
    window.location.assign(url)
  } catch (cause) {
    if (!isUnavailable(cause)) error.value = errorMessage(cause)
  } finally {
    downloading.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <nav aria-label="Folder path" class="flex min-w-0 flex-wrap items-center gap-1 text-sm">
      <button type="button" class="truncate text-primary hover:underline disabled:text-foreground disabled:no-underline" :disabled="!prefix" @click="prefix = ''">{{ rootName }}</button>
      <template v-for="crumb in crumbs" :key="crumb.prefix">
        <ChevronRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <button type="button" class="truncate text-primary hover:underline disabled:text-foreground disabled:no-underline" :disabled="crumb.prefix === prefix" @click="prefix = crumb.prefix">{{ crumb.label }}</button>
      </template>
      <Spinner v-if="loading" label="Loading files" class="ml-2" />
    </nav>

    <RefusalNote v-if="error" :message="error" />

    <div class="surface overflow-hidden">
      <div class="min-w-0 overflow-x-auto">
        <table class="data-table w-full text-sm">
          <thead>
            <tr>
              <th class="w-8 py-2 pl-4"><span class="sr-only">Type</span></th>
              <th class="px-3 py-2 text-left font-semibold">Name</th>
              <th class="px-3 py-2 text-right font-semibold">Size</th>
              <th class="px-3 py-2 text-left font-semibold">Modified</th>
              <th class="py-2 pr-4"><span class="sr-only">Download</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in shown" :key="entry.name" class="border-t border-border">
              <td class="py-2 pl-4 text-muted-foreground">
                <Folder v-if="entry.folder" class="h-4 w-4 text-primary" aria-hidden="true" />
                <FileIcon v-else class="h-4 w-4" aria-hidden="true" />
              </td>
              <td class="max-w-[28rem] px-3 py-2">
                <button v-if="entry.folder" type="button" class="block max-w-full truncate text-left text-primary hover:underline" @click="prefix = entry.name">{{ leaf(entry.name) }}</button>
                <span v-else class="block truncate text-foreground" :title="entry.name">{{ leaf(entry.name) }}</span>
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">{{ entry.file?.size != null ? formatBytes(entry.file.size) : '' }}</td>
              <td class="whitespace-nowrap px-3 py-2 text-muted-foreground">{{ entry.file?.last_modified ? formatDateTime(entry.file.last_modified) : '' }}</td>
              <td class="py-2 pr-4 text-right">
                <Button v-if="!entry.folder" variant="outline" size="icon-sm" :disabled="downloading === entry.name" :aria-label="`Download ${leaf(entry.name)}`" title="Download" @click="download(entry.name)">
                  <Download class="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
            <tr v-if="!entries.length && !loading">
              <td colspan="5" class="px-4 py-6 text-center text-xs text-muted-foreground">This folder is empty.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ListPager v-if="entries.length > 10" v-model:page="page" v-model:page-size="pageSize" :total="entries.length" class="border-t border-border" />
    </div>

    <VisitUpload v-if="uploads" :visit="visit" :prefix="prefix" :upload-only="false" @landed="load" />
  </div>
</template>
