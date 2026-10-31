<script setup lang="ts">
// The access log of one share link: opens, wrong passwords, downloads and uploads, newest first.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ScrollText } from '@lucide/vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import ListPager from '@/components/ui/ListPager.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { shareClient, shareErrorMessage } from '@/composables/useShareLinks'
import { shareLog, type ShareAction, type ShareInfo, type ShareLogEntry } from '@/lib/api'
import { targetPath } from '@/lib/shareLinks'
import { formatBytes, formatDateTime } from '@/lib/utils'

const props = defineProps<{ open: boolean; share: ShareInfo | null; nodeId: string | null }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const ACTIONS: Record<ShareAction, string> = {
  open: 'Opened',
  wrong_password: 'Wrong password',
  download: 'Download',
  upload: 'Upload',
}

const entries = ref<ShareLogEntry[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const page = ref(1)
const pageSize = ref(10)
const shown = computed(() => entries.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

let generation = 0
watch(
  () => [props.open, props.share?.id] as const,
  ([open]) => {
    generation += 1
    entries.value = []
    page.value = 1
    if (open && props.share) void load(props.share.id)
  },
  { immediate: true },
)

async function load(id: string) {
  const run = generation
  loading.value = true
  error.value = null
  try {
    const client = await shareClient(props.nodeId)
    const all: ShareLogEntry[] = []
    let after: string | undefined
    do {
      const answer = await shareLog(id, { after, limit: 1000 }, client)
      if (run !== generation) return
      all.push(...answer.entries)
      after = answer.next ?? undefined
    } while (after)
    entries.value = all.reverse()
  } catch (cause) {
    if (run === generation) error.value = shareErrorMessage(cause)
  } finally {
    if (run === generation) loading.value = false
  }
}

/** The file in the Data view, when the link opens a bucket path. */
function fileLink(key: string) {
  const target = props.share?.target
  if (!target || target.kind === 'dataset') return null
  const folder = key.split('/').slice(0, -1).join('/')
  const query = { ...(folder ? { prefix: folder } : {}), ...(props.nodeId ? { node: props.nodeId } : {}), object: key }
  return { name: 'bucket', params: { bucketId: target.bucket }, query }
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle class="flex min-w-0 items-center gap-2">
          <ScrollText class="h-4 w-4 shrink-0 text-primary" /> <span class="truncate">Access log</span>
        </DialogTitle>
        <DialogDescription v-if="share" class="truncate">{{ targetPath(share.target) }}</DialogDescription>
      </DialogHeader>
      <Spinner v-if="loading" label="Loading the log" />
      <RefusalNote v-else-if="error" :message="error" />
      <p v-else-if="!entries.length" class="text-sm text-muted-foreground">Nobody used this link yet.</p>
      <div v-else class="surface overflow-hidden">
        <div class="min-w-0 overflow-x-auto">
          <table class="data-table min-w-max text-xs">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left font-semibold">Time</th>
                <th class="px-4 py-2 text-left font-semibold">Action</th>
                <th class="px-4 py-2 text-left font-semibold">File</th>
                <th class="px-4 py-2 text-right font-semibold">Size</th>
                <th class="px-4 py-2 text-left font-semibold">Client network</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in shown" :key="entry.id" class="border-t border-border">
                <td class="whitespace-nowrap px-4 py-2 text-muted-foreground">{{ formatDateTime(entry.at) }}</td>
                <td class="px-4 py-2 text-foreground">{{ ACTIONS[entry.action] ?? entry.action }}</td>
                <td class="max-w-[18rem] truncate px-4 py-2" :title="entry.key ?? undefined">
                  <template v-if="entry.key">
                    <RouterLink v-if="fileLink(entry.key)" :to="fileLink(entry.key)!" class="text-primary hover:underline">{{ entry.key }}</RouterLink>
                    <template v-else>{{ entry.key }}</template>
                  </template>
                </td>
                <td class="whitespace-nowrap px-4 py-2 text-right tabular-nums text-muted-foreground">{{ entry.bytes != null ? formatBytes(entry.bytes) : '' }}</td>
                <td class="px-4 py-2 font-mono text-muted-foreground">{{ entry.client ?? '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ListPager v-if="entries.length > 10" v-model:page="page" v-model:page-size="pageSize" :total="entries.length" class="border-t border-border" />
      </div>
    </DialogContent>
  </Dialog>
</template>
