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
import Select from '@/components/ui/Select.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import { useS3 } from '@/composables/useS3'
import { useAruna } from '@/composables/useAruna'
import { isDrsReference, type TesFileType } from '@/lib/tes'
import { ref, watch } from 'vue'
import { Database, KeyRound, LogIn, Plus, ShieldAlert } from '@lucide/vue'

// Picker for a TES input reference (aruna#290): browse the node's own S3 data or
// paste a DRS id / URL. Emits one TES-shaped entry per add. Mirrors
// SelectDataDialog's Dialog/Tabs skeleton and credential-bootstrap cascade.
const props = defineProps<{ open: boolean; mode: 'input' }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'add', entry: { url: string; path: string; type: TesFileType; name?: string }): void
}>()

const s3 = useS3()
const { currentUser } = useAruna()

const tab = ref('node')
const credentialDialogOpen = ref(false)

const refUrl = ref('')
const refPath = ref('/inputs/')
// Plain string ref to match the Select's string v-model; narrowed on emit.
const refType = ref('FILE')
const pathTouched = ref(false)
const urlInvalid = ref(false)
const pathInvalid = ref(false)

const typeOptions = [
  { value: 'FILE', label: 'File' },
  { value: 'DIRECTORY', label: 'Directory' },
]

function lastSegment(url: string): string {
  const clean = url.trim().split(/[?#]/)[0].replace(/\/+$/, '')
  return clean.split('/').pop() || ''
}

// Keep the container path in sync with the reference's last segment until the
// user edits it themselves (the keyTouched pattern).
watch(refUrl, (url) => {
  if (pathTouched.value) return
  const seg = lastSegment(url)
  refPath.value = seg ? `/inputs/${seg}` : '/inputs/'
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    tab.value = s3.endpoint.value ? 'node' : 'drs'
    refUrl.value = ''
    refPath.value = '/inputs/'
    refType.value = 'FILE'
    pathTouched.value = false
    urlInvalid.value = false
    pathInvalid.value = false
  },
  { immediate: true },
)

function pickObject(entry: { bucket: string; key: string; name: string }) {
  emit('add', {
    url: `s3://${entry.bucket}/${entry.key}`,
    path: `/inputs/${entry.name}`,
    type: 'FILE',
    name: entry.name,
  })
  emit('update:open', false)
}

function addReference() {
  const url = refUrl.value.trim()
  const path = refPath.value.trim()
  urlInvalid.value = !(isDrsReference(url) || /^(https?|s3|ftp):\/\//i.test(url))
  pathInvalid.value = !path.startsWith('/')
  if (urlInvalid.value || pathInvalid.value) return
  emit('add', { url, path, type: refType.value as TesFileType })
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Database class="h-4 w-4 text-primary" /> Add input reference
        </DialogTitle>
        <DialogDescription>
          Reference an object stored on this node, or a DRS id / URL. The node stages inputs into the task's working directory.
        </DialogDescription>
      </DialogHeader>

      <Tabs v-model="tab">
        <TabsList>
          <TabsTrigger value="node">Node data</TabsTrigger>
          <TabsTrigger value="drs">DRS / URL</TabsTrigger>
        </TabsList>

        <TabsContent value="node">
          <div v-if="!s3.endpoint.value" class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>This node does not advertise an S3 endpoint — reference data by DRS id or URL instead.</span>
          </div>
          <div v-else-if="!s3.hasActiveKey.value" class="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
            <p class="flex items-center gap-2 font-medium text-foreground"><KeyRound class="h-3.5 w-3.5" /> S3 credentials needed to browse node data.</p>
            <Button v-if="currentUser" variant="outline" size="sm" @click="credentialDialogOpen = true">
              <Plus class="size-3.5" /> Create credentials
            </Button>
            <p v-else class="flex items-center gap-2"><LogIn class="h-3.5 w-3.5" /> Sign in first to create credentials.</p>
          </div>
          <template v-else>
            <ObjectBrowserPanel @select="pickObject" />
            <!-- Honesty contract: the S3 ETag is MD5 (api/src/s3/s3_service.rs),
                 not the blake3 content hash DRS ids use, so a DRS id cannot be
                 derived from a bucket listing. -->
            <p class="pt-2 text-[11px] leading-relaxed text-muted-foreground">
              Picked objects are referenced as <code class="rounded bg-muted px-1">s3://bucket/key</code> — the node resolves its own S3 paths when staging inputs. Content-addressed DRS ids cannot be derived from a bucket listing; paste one under DRS / URL if you have it.
            </p>
          </template>
        </TabsContent>

        <TabsContent value="drs" class="space-y-3">
          <div>
            <label class="text-xs font-medium text-foreground">Reference</label>
            <Input
              v-model="refUrl"
              class="mt-1 font-mono"
              placeholder="https://w3id.org/aruna/data/<hash> or s3://bucket/key"
              :invalid="urlInvalid ? 'error' : undefined"
            />
            <p v-if="urlInvalid" class="mt-1 text-[11px] text-destructive">Use a DRS id or an absolute URL (http(s)://, s3://, drs://, ftp://).</p>
            <p class="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              DRS ids this realm resolves: <code class="rounded bg-muted px-1">https://w3id.org/aruna/data/&lt;blake3-hex&gt;</code> (canonical content id — the same id published crate artifacts carry) or <code class="rounded bg-muted px-1">arn:aruna:&lt;realm&gt;:&lt;node&gt;:ch/&lt;hex&gt;</code>; <code class="rounded bg-muted px-1">drs://</code> URIs and plain URLs are passed to the backend verbatim.
            </p>
          </div>
          <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div>
              <label class="text-xs font-medium text-foreground">Container path</label>
              <Input
                v-model="refPath"
                class="mt-1 font-mono"
                placeholder="/inputs/reads.fastq.gz"
                :invalid="pathInvalid ? 'error' : undefined"
                @input="pathTouched = true"
              />
              <p v-if="pathInvalid" class="mt-1 text-[11px] text-destructive">Use an absolute container path (starts with /).</p>
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Type</label>
              <Select v-model="refType" :options="typeOptions" class="mt-1" />
            </div>
          </div>
          <div class="flex justify-end">
            <Button :disabled="!refUrl.trim()" @click="addReference"><Plus class="size-3.5" /> Add reference</Button>
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <DialogClose><Button variant="outline">Close</Button></DialogClose>
      </DialogFooter>

      <CreateCredentialDialog v-model:open="credentialDialogOpen" />
    </DialogContent>
  </Dialog>
</template>
