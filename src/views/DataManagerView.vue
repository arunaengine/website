<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Breadcrumbs from '@/components/data/Breadcrumbs.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import Progress from '@/components/ui/Progress.vue'
import { useAruna } from '@/composables/useAruna'
import { useS3, s3ErrorMessage, type BucketEntry, type FolderEntry, type ObjectEntry, type UploadHandle } from '@/composables/useS3'
import { formatBytes, relativeTime } from '@/lib/utils'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Boxes,
  Download,
  FolderPlus,
  KeyRound,
  Loader2,
  LogIn,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const { currentUser } = useAruna()
const s3 = useS3()

const bucket = computed(() => (route.params.bucketId as string | undefined) ?? '')
const prefix = computed(() => (route.query.prefix as string | undefined) ?? '')
const s3Prefix = computed(() => (prefix.value ? `${prefix.value}/` : ''))

const buckets = ref<BucketEntry[]>([])
const bucketsLoading = ref(false)
const bucketsError = ref<string | null>(null)

const folders = ref<FolderEntry[]>([])
const objects = ref<ObjectEntry[]>([])
const nextToken = ref<string | undefined>(undefined)
const listLoading = ref(false)
const listError = ref<string | null>(null)

const newBucketName = ref('')
const creatingBucket = ref(false)
const createBucketError = ref<string | null>(null)

const credentialDialogOpen = ref(false)
const manualKeyId = ref('')
const manualSecret = ref('')

const keyTail = computed(() => s3.activeKey.value?.accessKeyId.slice(-4) ?? '')

interface UploadItem {
  id: number
  name: string
  state: 'uploading' | 'done' | 'error' | 'canceled'
  progress: number
  error?: string
}
const uploads = ref<UploadItem[]>([])
const uploadHandles = new Map<number, UploadHandle>()
let uploadCounter = 0
const fileInput = ref<HTMLInputElement | null>(null)
const dragActive = ref(false)

const deleteTarget = ref<ObjectEntry | null>(null)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

async function refreshBuckets() {
  if (!s3.hasActiveKey.value) return
  bucketsLoading.value = true
  bucketsError.value = null
  try {
    buckets.value = await s3.listBuckets()
  } catch (err) {
    bucketsError.value = s3ErrorMessage(err)
    buckets.value = []
  } finally {
    bucketsLoading.value = false
  }
}

async function loadObjects(reset: boolean) {
  if (!s3.hasActiveKey.value || !bucket.value) return
  listLoading.value = true
  listError.value = null
  if (reset) {
    folders.value = []
    objects.value = []
    nextToken.value = undefined
  }
  try {
    const page = await s3.listObjects(bucket.value, s3Prefix.value, nextToken.value)
    folders.value = reset ? page.folders : [...folders.value, ...page.folders]
    objects.value = reset ? page.objects : [...objects.value, ...page.objects]
    nextToken.value = page.nextToken
  } catch (err) {
    listError.value = s3ErrorMessage(err)
  } finally {
    listLoading.value = false
  }
}

watch(
  [() => s3.hasActiveKey.value, bucket, prefix],
  ([hasKey]) => {
    if (!hasKey) return
    void refreshBuckets()
    if (bucket.value) void loadObjects(true)
  },
  { immediate: true },
)

function activateManualKey() {
  if (!manualKeyId.value.trim() || !manualSecret.value.trim()) return
  s3.setActiveKey({ accessKeyId: manualKeyId.value.trim(), secretAccessKey: manualSecret.value.trim() })
  manualKeyId.value = ''
  manualSecret.value = ''
}

function openBucket(name: string) {
  router.push({ name: 'bucket', params: { bucketId: name } })
}

function navigateTo(path: string) {
  router.push({
    name: 'bucket',
    params: { bucketId: bucket.value },
    query: path ? { prefix: path } : {},
  })
}

function openFolder(folder: FolderEntry) {
  navigateTo(folder.prefix.replace(/\/$/, ''))
}

async function createBucket() {
  const name = newBucketName.value.trim()
  if (!name) return
  creatingBucket.value = true
  createBucketError.value = null
  try {
    await s3.createBucket(name)
    newBucketName.value = ''
    await refreshBuckets()
    openBucket(name)
  } catch (err) {
    createBucketError.value = s3ErrorMessage(err)
  } finally {
    creatingBucket.value = false
  }
}

function pickFiles() {
  fileInput.value?.click()
}

function onFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) void uploadFiles(Array.from(input.files))
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragActive.value = false
  if (!bucket.value || !event.dataTransfer?.files.length) return
  void uploadFiles(Array.from(event.dataTransfer.files))
}

async function uploadFiles(files: File[]) {
  for (const file of files) {
    const item: UploadItem = { id: ++uploadCounter, name: file.name, state: 'uploading', progress: 0 }
    uploads.value = [...uploads.value, item]
    const handle = s3.uploadObject(bucket.value, `${s3Prefix.value}${file.name}`, file, (loaded, total) => {
      item.progress = total ? Math.round((loaded / total) * 100) : 0
      uploads.value = [...uploads.value]
    })
    uploadHandles.set(item.id, handle)
    try {
      await handle.promise
      item.state = 'done'
      item.progress = 100
    } catch (err) {
      if (item.state !== 'canceled') {
        item.state = 'error'
        item.error = s3ErrorMessage(err)
      }
    } finally {
      uploadHandles.delete(item.id)
    }
    uploads.value = [...uploads.value]
  }
  await loadObjects(true)
}

async function cancelUpload(item: UploadItem) {
  const handle = uploadHandles.get(item.id)
  if (!handle) return
  item.state = 'canceled'
  uploads.value = [...uploads.value]
  await handle.abort().catch(() => undefined)
}

function clearFinishedUploads() {
  uploads.value = uploads.value.filter((item) => item.state === 'uploading')
}

async function download(object: ObjectEntry) {
  try {
    const url = await s3.downloadUrl(bucket.value, object.key)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = object.name
    anchor.rel = 'noopener'
    anchor.click()
  } catch (err) {
    listError.value = s3ErrorMessage(err)
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleteBusy.value = true
  deleteError.value = null
  try {
    await s3.deleteObject(bucket.value, deleteTarget.value.key)
    deleteTarget.value = null
    await loadObjects(true)
  } catch (err) {
    deleteError.value = s3ErrorMessage(err)
  } finally {
    deleteBusy.value = false
  }
}

const isEmpty = computed(
  () => !listLoading.value && !listError.value && !folders.value.length && !objects.value.length,
)
</script>

<template>
  <div>
    <PageHeader
      title="Data"
      description="Browse buckets and objects through the node's S3 interface, signed in your browser."
    >
      <template #actions>
        <template v-if="s3.hasActiveKey.value">
          <span
            class="flex items-center gap-1 font-mono text-[11px] text-muted-foreground"
            :title="`Signing with key ${s3.activeKey.value?.accessKeyId} — manage keys in Settings`"
          >
            <KeyRound class="h-3 w-3" /> …{{ keyTail }}
          </span>
          <Button variant="outline" size="sm" @click="refreshBuckets(); bucket && loadObjects(true)"><RefreshCw class="h-4 w-4" /> Refresh</Button>
        </template>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <section v-if="!s3.endpoint.value" class="surface border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-900 dark:text-amber-200">
        <div class="flex items-start gap-3">
          <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0" />
          <p>This node does not advertise an S3 endpoint, so the data manager cannot connect.</p>
        </div>
      </section>

      <section v-else-if="!s3.hasActiveKey.value" class="grid gap-4 md:grid-cols-2">
        <div class="surface p-6">
          <div class="flex items-center gap-2">
            <KeyRound class="h-4 w-4 text-primary" />
            <h2 class="font-display text-base font-semibold text-aruna-navy">Create S3 credentials</h2>
          </div>
          <p class="mt-2 text-sm text-muted-foreground">
            Mint a group-scoped key for this realm. The same key works in the browser and in any S3 client.
          </p>
          <div class="mt-4">
            <Button v-if="currentUser" @click="credentialDialogOpen = true"><Plus class="h-4 w-4" /> Create credentials</Button>
            <p v-else class="flex items-center gap-2 text-sm text-muted-foreground"><LogIn class="h-4 w-4" /> Sign in first to create credentials.</p>
          </div>
        </div>
        <div class="surface p-6">
          <div class="flex items-center gap-2">
            <Boxes class="h-4 w-4 text-primary" />
            <h2 class="font-display text-base font-semibold text-aruna-navy">Use an existing key</h2>
          </div>
          <p class="mt-2 text-sm text-muted-foreground">
            The key is kept in this browser so the session survives reloads. Revoke keys under Settings.
          </p>
          <div class="mt-4 space-y-2">
            <Input v-model="manualKeyId" placeholder="Access key ID" class="font-mono text-xs" />
            <Input v-model="manualSecret" placeholder="Secret access key" type="password" class="font-mono text-xs" @keyup.enter="activateManualKey" />
            <Button variant="outline" :disabled="!manualKeyId.trim() || !manualSecret.trim()" @click="activateManualKey">Use key</Button>
          </div>
        </div>
      </section>

      <section v-else class="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside class="space-y-3">
          <div class="surface overflow-hidden">
            <header class="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 class="text-sm font-semibold text-foreground">Buckets</h2>
              <Badge variant="outline">{{ buckets.length }}</Badge>
            </header>
            <div v-if="bucketsLoading" class="flex items-center gap-2 px-4 py-4 text-xs text-muted-foreground">
              <Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading buckets…
            </div>
            <p v-else-if="bucketsError" class="px-4 py-3 text-xs text-destructive">{{ bucketsError }}</p>
            <ul v-else-if="buckets.length" class="max-h-[420px] overflow-y-auto py-1">
              <li v-for="entry in buckets" :key="entry.name">
                <button
                  class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted"
                  :class="entry.name === bucket ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'"
                  @click="openBucket(entry.name)"
                >
                  <Boxes class="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span class="truncate">{{ entry.name }}</span>
                </button>
              </li>
            </ul>
            <p v-else class="px-4 py-4 text-xs text-muted-foreground">No buckets in this group yet.</p>
            <footer class="space-y-2 border-t border-border p-3">
              <div class="flex gap-2">
                <Input v-model="newBucketName" placeholder="new-bucket-name" class="h-8 font-mono text-xs" @keyup.enter="createBucket" />
                <Button variant="outline" size="sm" :disabled="creatingBucket || !newBucketName.trim()" @click="createBucket">
                  <FolderPlus class="h-4 w-4" />
                </Button>
              </div>
              <p v-if="createBucketError" class="text-xs text-destructive">{{ createBucketError }}</p>
            </footer>
          </div>
        </aside>

        <div class="min-w-0 space-y-4">
          <div v-if="!bucket" class="surface grid place-items-center p-12 text-sm text-muted-foreground">
            Select a bucket to browse its objects.
          </div>

          <template v-else>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <Breadcrumbs :bucket="bucket" :path="prefix" @navigate="navigateTo" />
              <div class="flex items-center gap-2">
                <input ref="fileInput" type="file" multiple class="hidden" @change="onFileInput" />
                <Button size="sm" @click="pickFiles"><Upload class="h-4 w-4" /> Upload</Button>
              </div>
            </div>

            <div v-if="uploads.length" class="surface space-y-1 p-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Uploads</span>
                <Button variant="ghost" size="sm" @click="clearFinishedUploads">Clear finished</Button>
              </div>
              <div v-for="item in uploads" :key="item.id" class="flex items-center gap-2 text-xs">
                <Loader2 v-if="item.state === 'uploading'" class="h-3 w-3 shrink-0 animate-spin text-primary" />
                <Badge v-else :variant="item.state === 'done' ? 'accent' : item.state === 'canceled' ? 'secondary' : 'destructive'" class="text-[10px] uppercase">{{ item.state }}</Badge>
                <span class="min-w-0 flex-none truncate font-mono" :class="item.state === 'uploading' ? 'max-w-[40%]' : ''">{{ item.name }}</span>
                <template v-if="item.state === 'uploading'">
                  <Progress :value="item.progress" :warn="101" :critical="101" class="h-1.5 flex-1" />
                  <span class="w-9 shrink-0 text-right font-mono text-muted-foreground">{{ item.progress }}%</span>
                  <Button variant="ghost" size="sm" class="h-6 shrink-0 px-2" @click="cancelUpload(item)">Cancel</Button>
                </template>
                <span v-if="item.error" class="truncate text-destructive">{{ item.error }}</span>
              </div>
            </div>

            <div
              class="surface overflow-hidden"
              :class="dragActive ? 'ring-2 ring-primary ring-offset-2' : ''"
              @dragover.prevent="dragActive = true"
              @dragleave="dragActive = false"
              @drop.prevent="onDrop"
            >
              <p v-if="listError" class="border-b border-border px-4 py-3 text-xs text-destructive">{{ listError }}</p>
              <table class="w-full text-sm">
                <thead class="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th class="px-4 py-2 text-left font-semibold">Name</th>
                    <th class="px-4 py-2 text-right font-semibold">Size</th>
                    <th class="px-4 py-2 text-left font-semibold">Modified</th>
                    <th class="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="folder in folders"
                    :key="folder.prefix"
                    class="cursor-pointer border-t border-border hover:bg-muted/50"
                    @click="openFolder(folder)"
                  >
                    <td class="px-4 py-2.5">
                      <span class="flex items-center gap-2"><ObjectIcon :name="folder.name" folder class="h-4 w-4" /> {{ folder.name }}/</span>
                    </td>
                    <td class="px-4 py-2.5 text-right text-muted-foreground">—</td>
                    <td class="px-4 py-2.5 text-muted-foreground">—</td>
                    <td class="px-4 py-2.5"></td>
                  </tr>
                  <tr v-for="object in objects" :key="object.key" class="border-t border-border hover:bg-muted/30">
                    <td class="px-4 py-2.5">
                      <span class="flex items-center gap-2"><ObjectIcon :name="object.name" class="h-4 w-4" /> <span class="truncate">{{ object.name }}</span></span>
                    </td>
                    <td class="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{{ object.size !== undefined ? formatBytes(object.size) : '—' }}</td>
                    <td class="px-4 py-2.5 text-xs text-muted-foreground">{{ object.lastModified ? relativeTime(object.lastModified.toISOString()) : '—' }}</td>
                    <td class="px-4 py-2.5">
                      <div class="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label="Download" @click="download(object)"><Download /></Button>
                        <Button variant="ghost" size="icon-sm" class="text-destructive hover:text-destructive" aria-label="Delete" @click="deleteTarget = object; deleteError = null"><Trash2 /></Button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="isEmpty">
                    <td colspan="4" class="px-4 py-10 text-center text-xs text-muted-foreground">
                      This prefix is empty. Drop files here or use Upload.
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="listLoading" class="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
                <Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading objects…
              </div>
              <div v-else-if="nextToken" class="border-t border-border px-4 py-2">
                <Button variant="ghost" size="sm" @click="loadObjects(false)">Load more</Button>
              </div>
            </div>
          </template>
        </div>
      </section>
    </div>

    <CreateCredentialDialog v-model:open="credentialDialogOpen" />

    <Dialog :open="deleteTarget !== null" @update:open="(v: boolean) => { if (!v) deleteTarget = null }">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete object</DialogTitle>
          <DialogDescription>
            Deletes <span class="font-mono text-xs">{{ deleteTarget?.key }}</span> from
            <span class="font-mono text-xs">{{ bucket }}</span>. A delete marker is written; earlier versions stay retrievable by version ID.
          </DialogDescription>
        </DialogHeader>
        <p v-if="deleteError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ deleteError }}</p>
        <DialogFooter>
          <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
          <Button variant="destructive" :disabled="deleteBusy" @click="confirmDelete">{{ deleteBusy ? 'Deleting…' : 'Delete' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
