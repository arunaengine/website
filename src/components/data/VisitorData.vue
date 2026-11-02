<script setup lang="ts">
// The Data view for a visitor: the public buckets and their files, read-only. Files list on a node
// that holds the bucket and download from its S3; nothing here can change data.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BucketRow from '@/components/data/BucketRow.vue'
import Breadcrumbs from '@/components/data/Breadcrumbs.vue'
import DatabaseHeader from '@/components/data/DatabaseHeader.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import VisitorFileDialog from '@/components/data/VisitorFileDialog.vue'
import BucketChooser from '@/components/data/manager/BucketChooser.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import ListPager from '@/components/ui/ListPager.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useListedUsage, usageText } from '@/composables/useBucketUsage'
import { PAGE_SIZES } from '@/composables/useListPages'
import { publicDownload, usePublicBuckets, usePublicFolder, type PublicFile } from '@/composables/usePublicData'
import { useRealmNodes } from '@/composables/useRealmNodes'
import type { ListedBucket } from '@/lib/distribution'
import { formatCount } from '@/lib/formatCount'
import { pageRange } from '@/lib/objectListing'
import { formatBytes, relativeTime } from '@/lib/utils'
import { Boxes, ChevronLeft, ChevronRight, Download, FolderOpen, LogIn } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const { getNodeInfo, nodeInfo } = useAruna()
const { requestSignIn } = useAuth()
const realmNodes = useRealmNodes()
const usage = useListedUsage()
const text = (value: unknown) => (typeof value === 'string' ? value : '')

const { buckets, loading: bucketsLoading, error: bucketsError, failedNodes, reload: reloadBuckets } = usePublicBuckets()
const filter = ref('')
const shown = computed(() => {
  const term = filter.value.trim().toLowerCase()
  return term ? buckets.value.filter((row) => row.bucket.toLowerCase().includes(term)) : buckets.value
})
const listPage = ref(1)
const listSize = ref(25)
watch(filter, () => (listPage.value = 1))
const pageRows = computed(() => shown.value.slice((listPage.value - 1) * listSize.value, listPage.value * listSize.value))
// The connected node is asked without a node id.
const nodeArg = (nodeId: string | null) => (nodeId && !realmNodes.isLocalNode(nodeId) ? nodeId : null)
watch(pageRows, (rows) => usage.ensure(rows.map((row) => ({ bucket: row.bucket, nodeId: nodeArg(row.node_id) }))), { immediate: true })

const bucket = computed(() => text(route.params.bucketId))
const prefix = computed(() => text(route.query.prefix).replace(/\/+$/, ''))
const s3Prefix = computed(() => (prefix.value ? `${prefix.value}/` : ''))
const routeNode = computed(() => text(route.query.node) || null)
const openRow = computed(() => buckets.value.find((row) => row.bucket === bucket.value && (!routeNode.value || row.nodes.includes(routeNode.value))))
// The node that lists the bucket: the address names it, else the public list does once read.
const holder = computed(() => routeNode.value ?? openRow.value?.node_id ?? null)
const listedBucket = computed(() => (holder.value || !bucketsLoading.value ? bucket.value : ''))
const listNode = computed(() => nodeArg(holder.value))
const storedOn = computed(() => openRow.value?.nodes ?? (holder.value ? [holder.value] : []))

const pageSize = ref(25)
const folder = usePublicFolder(listedBucket, s3Prefix, listNode, pageSize)
const { folders, files, loading, error, denied, page, nextCursor } = folder
const pageSizeOptions = PAGE_SIZES.filter((size) => size <= 100).map((size) => ({ value: String(size), label: String(size) }))
const empty = computed(() => !loading.value && !error.value && !folders.value.length && !files.value.length)
const rangeText = computed(() => pageRange(page.value, pageSize.value, folders.value.length + files.value.length, !nextCursor.value))

// Downloads go to the S3 endpoint of the node that lists the files.
const s3Url = ref<string | null>(null)
watch(listNode, async (nodeId) => {
  s3Url.value = null
  const info = nodeId ? await getNodeInfo(nodeId).catch(() => null) : nodeInfo.value
  if (nodeId === listNode.value) s3Url.value = info?.services?.interfaces?.s3?.url ?? null
}, { immediate: true })
const downloadOf = (file: PublicFile) => (s3Url.value ? publicDownload(s3Url.value, bucket.value, file.key) : null)

const bucketUsage = computed(() => (bucket.value ? usage.textOf(bucket.value, listNode.value) : null))
watch([bucket, listNode], () => bucket.value && usage.ensure([{ bucket: bucket.value, nodeId: listNode.value }]), { immediate: true })

function openBucket(row: ListedBucket) {
  void router.push({ name: 'bucket', params: { bucketId: row.bucket }, query: { node: row.node_id } })
}
function openFolder(path: string) {
  const query = { ...(path ? { prefix: path } : {}), ...(routeNode.value ? { node: routeNode.value } : {}) }
  void router.push({ name: 'bucket', params: { bucketId: bucket.value }, query })
}

const details = ref<PublicFile | null>(null)
watch([bucket, s3Prefix], () => (details.value = null))
</script>

<template>
  <section class="grid gap-x-6 gap-y-8 @min-[960px]:grid-cols-[300px_minmax(0,1fr)] @min-[1536px]:grid-cols-[340px_minmax(0,1fr)]">
    <aside class="min-w-0 self-start">
      <SectionHeading title="Public buckets" :icon="Boxes" :count="bucketsLoading ? undefined : `${formatCount(shown.length)}${failedNodes ? '+' : ''}`" />
      <div class="surface">
        <div class="px-3.5 pb-1 pt-3">
          <Input v-model="filter" placeholder="Find a bucket" aria-label="Find a bucket" class="h-8 text-xs" />
        </div>
        <Spinner v-if="bucketsLoading && !buckets.length" show-label label="Loading buckets…" class="px-3 py-4" />
        <p v-else-if="bucketsError" class="px-3.5 py-3 text-xs text-destructive">{{ bucketsError }}</p>
        <p v-else-if="!shown.length" class="px-3.5 py-3 text-xs text-muted-foreground">
          {{ filter.trim() ? 'No public bucket has this name.' : failedNodes ? 'No public buckets found.' : 'This realm has no public buckets.' }}
        </p>
        <ul v-else class="pb-1">
          <li v-for="row in pageRows" :key="`${row.set_id ?? row.node_id}/${row.bucket}`">
            <BucketRow
              :bucket="row.bucket"
              :node-id="row.node_id"
              :nodes="row.set_id ? row.nodes : []"
              :parts="usage.partsOf(row.bucket, nodeArg(row.node_id))"
              :active="row.bucket === bucket && row.nodes.includes(holder ?? '')"
              :pinnable="false"
              @open="openBucket(row)"
            />
          </li>
        </ul>
        <ListPager v-if="shown.length > 10" v-model:page="listPage" v-model:page-size="listSize" :total="shown.length" class="border-t border-border-subtle" />
        <p v-if="failedNodes" class="border-t border-border/70 px-3.5 py-2 text-xs text-muted-foreground">
          {{ failedNodes }} {{ failedNodes === 1 ? 'node' : 'nodes' }} did not answer.
          <button type="button" class="text-primary hover:underline" @click="reloadBuckets()">Retry</button>
        </p>
      </div>
    </aside>

    <BucketChooser v-if="!bucket" />
    <div v-else class="min-w-0 space-y-4">
      <SectionHeading title="Files" :icon="FolderOpen" />
      <DatabaseHeader :bucket="bucket" :node-id="listNode" :set-id="openRow ? (openRow.set_id ?? null) : undefined">
        <span v-if="bucketUsage" class="tabular-nums">{{ bucketUsage }}</span>
      </DatabaseHeader>
      <slot name="header" />

      <div class="surface overflow-clip">
        <div class="flex min-w-0 items-center gap-2 px-4 pb-2 pt-2.5 @max-[600px]:px-3">
          <Breadcrumbs :bucket="bucket" :path="prefix" single-line @navigate="openFolder" />
          <Spinner v-if="loading" label="Loading files" class="shrink-0" />
        </div>
        <div v-if="denied" class="border-t border-border px-4 py-6 text-sm">
          <p class="font-medium text-foreground">This bucket is not public.</p>
          <p class="mt-1 text-muted-foreground">Sign in to see the data of your groups.</p>
          <Button size="sm" class="mt-3" @click="requestSignIn({ redirectTo: route.fullPath })"><LogIn class="h-4 w-4" /> Sign in</Button>
        </div>
        <p v-else-if="error" class="border-t border-border px-4 py-3 text-xs text-destructive">{{ error }}</p>
        <table v-else class="w-full table-fixed text-sm @max-[600px]:block">
          <colgroup class="@max-[600px]:hidden">
            <col class="w-11" />
            <col class="@min-[1280px]:w-[40rem]" />
            <col class="w-24" />
            <col class="w-24 @max-[720px]:w-0" />
            <col class="hidden @min-[1280px]:table-column" />
            <col class="w-14" />
          </colgroup>
          <thead class="text-xs text-muted-foreground @max-[600px]:hidden">
            <tr class="border-b border-border">
              <th class="p-0"></th>
              <th class="px-3 py-2 text-left font-medium">Name</th>
              <th class="px-3 py-2 text-right font-medium">Size</th>
              <th class="overflow-hidden px-3 py-2 text-left font-medium @max-[720px]:p-0"><span class="@max-[720px]:hidden">Modified</span></th>
              <th class="hidden @min-[1280px]:table-cell"></th>
              <th class="p-0"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody class="@max-[600px]:block">
            <tr
              v-for="entry in folders"
              :key="entry.prefix"
              class="cursor-pointer border-b border-border hover:bg-muted/50 @max-[600px]:flex @max-[600px]:items-center"
              @click="openFolder(entry.prefix.replace(/\/$/, ''))"
            >
              <td class="h-11 w-11 @max-[600px]:hidden"></td>
              <td class="px-3 py-2 @max-[600px]:block @max-[600px]:min-w-0 @max-[600px]:flex-1">
                <span class="flex min-w-0 items-center gap-2">
                  <ObjectIcon :name="entry.name" folder class="h-4 w-4" />
                  <button type="button" class="min-w-0 truncate text-left font-medium text-foreground hover:underline" :title="`${entry.name}/`" @click.stop="openFolder(entry.prefix.replace(/\/$/, ''))">{{ entry.name }}</button>
                </span>
              </td>
              <td class="@max-[600px]:hidden"></td>
              <td class="@max-[600px]:hidden"></td>
              <td class="hidden @min-[1280px]:table-cell"></td>
              <td class="@max-[600px]:hidden"></td>
            </tr>
            <tr
              v-for="file in files"
              :key="file.key"
              class="cursor-pointer border-b border-border hover:bg-muted/30 @max-[600px]:flex @max-[600px]:items-center"
              @click="details = file"
            >
              <td class="h-11 w-11 @max-[600px]:hidden"></td>
              <td class="px-3 py-2 @max-[600px]:block @max-[600px]:min-w-0 @max-[600px]:flex-1">
                <span class="flex min-w-0 items-center gap-2">
                  <ObjectIcon :name="file.name" class="h-4 w-4" />
                  <span class="min-w-0 truncate text-foreground" :title="file.name">{{ file.name }}</span>
                </span>
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground @max-[600px]:hidden">{{ file.size !== null ? formatBytes(file.size) : '' }}</td>
              <td class="overflow-hidden whitespace-nowrap px-3 py-2 text-muted-foreground @max-[720px]:p-0 @max-[600px]:hidden">
                <span class="@max-[720px]:hidden">{{ file.lastModified ? relativeTime(file.lastModified) : '' }}</span>
              </td>
              <td class="hidden @min-[1280px]:table-cell"></td>
              <td class="px-2 @max-[600px]:block">
                <div class="flex justify-end">
                  <Tooltip v-if="downloadOf(file)" label="Download">
                    <Button variant="outline" size="icon" class="h-8 w-8" as-child>
                      <a :href="downloadOf(file)!" download aria-label="Download" @click.stop><Download class="size-3.5" /></a>
                    </Button>
                  </Tooltip>
                </div>
              </td>
            </tr>
            <tr v-if="loading && !folders.length && !files.length" class="@max-[600px]:block">
              <td colspan="6" class="px-4 py-10 @max-[600px]:block"><Spinner show-label label="Loading files…" class="justify-center" /></td>
            </tr>
            <tr v-else-if="empty" class="@max-[600px]:block">
              <td colspan="6" class="px-4 py-10 text-center text-xs text-muted-foreground @max-[600px]:block">This folder is empty.</td>
            </tr>
          </tbody>
        </table>
        <div v-if="!denied && !error && (!empty || page > 1)" class="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs text-muted-foreground @max-[600px]:px-3">
          <span class="tabular-nums">{{ rangeText }}</span>
          <div v-if="page > 1 || nextCursor" class="flex flex-wrap items-center gap-3">
            <label class="flex items-center gap-2 @max-[600px]:hidden">
              Rows per page
              <Select :model-value="String(pageSize)" :options="pageSizeOptions" aria-label="Rows per page" class="h-8 w-20 text-xs text-foreground" @update:model-value="(value: string) => (pageSize = Number(value))" />
            </label>
            <span class="flex items-center gap-2">
              <IconButton label="Previous page" variant="outline" size="icon" class="h-8 w-8" :disabled="page <= 1 || loading" @click="folder.previousPage()"><ChevronLeft class="size-3.5" /></IconButton>
              <IconButton label="Next page" variant="outline" size="icon" class="h-8 w-8" :disabled="!nextCursor || loading" @click="folder.nextPage()"><ChevronRight class="size-3.5" /></IconButton>
            </span>
          </div>
        </div>
      </div>
    </div>

    <VisitorFileDialog :file="details" :bucket="bucket" :download="details ? downloadOf(details) : null" :nodes="storedOn" @close="details = null" />
  </section>
</template>
