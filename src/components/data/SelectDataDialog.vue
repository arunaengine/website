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
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import { useS3 } from '@/composables/useS3'
import { useAruna } from '@/composables/useAruna'
import {
  arunaContentReference,
  externalContentReference,
  resolveContentIdentity,
  stageSelectedContentReference,
  type AuthoredContentReference,
} from '@/lib/contentIdentity'
import { isAbsoluteUri } from '@/lib/profiles/uri'
import { ref, watch } from 'vue'
import { Database, KeyRound, Loader2, LogIn, Plus, ShieldAlert } from '@lucide/vue'

// Picker for a dataset data reference: browse the node's own S3 data or paste
// an external URL. Emits one `{ label, url }` entry per add, the same shape
// NewDatasetDialog's dataRefs rows hold.
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'add', entry: { label: string; url: string }): void
}>()

const s3 = useS3()
const { currentUser, getBlobLocations, nodeInfo, apiBaseUrl, authToken } = useAruna()

const tab = ref('node')
const credentialDialogOpen = ref(false)
const resolving = ref(false)
let pickToken = 0

const externalLabel = ref('')
const externalUrl = ref('')
const externalUrlInvalid = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) {
      ++pickToken
      resolving.value = false
      return
    }
    tab.value = s3.endpoint.value ? 'node' : 'external'
    externalLabel.value = ''
    externalUrl.value = ''
    externalUrlInvalid.value = false
  },
  { immediate: true },
)

function emitReference(label: string, reference: AuthoredContentReference) {
  const clearStaged = stageSelectedContentReference(reference)
  try {
    emit('add', { label, url: reference.id })
  } finally {
    clearStaged()
  }
  emit('update:open', false)
}

async function pickObject(entry: { bucket: string; key: string; name: string }) {
  if (resolving.value) return
  const token = ++pickToken
  resolving.value = true
  const location = `s3://${entry.bucket}/${entry.key}`
  try {
    const resolution = await resolveContentIdentity(entry.bucket, entry.key, {
      realmId: nodeInfo.value?.node.realm_id,
      nodeId: nodeInfo.value?.node.peer_id,
      apiBaseUrl: apiBaseUrl.value,
      authToken: authToken.value,
      getVersionId: async (bucket, key) => (await getBlobLocations(bucket, key)).version_id,
    })
    if (token !== pickToken || !props.open) return
    emitReference(entry.name, arunaContentReference(location, resolution))
  } finally {
    if (token === pickToken) resolving.value = false
  }
}

function addExternal() {
  const url = externalUrl.value.trim()
  externalUrlInvalid.value = !isAbsoluteUri(url)
  if (externalUrlInvalid.value) return
  ++pickToken
  resolving.value = false
  emitReference(externalLabel.value.trim(), externalContentReference(url))
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Database class="h-4 w-4 text-primary" /> Add data reference
        </DialogTitle>
        <DialogDescription>
          Pick an object stored on this node, or reference external data by URL. Each reference becomes a hasPart File entity in the RO-Crate.
        </DialogDescription>
      </DialogHeader>

      <Tabs v-model="tab">
        <TabsList>
          <TabsTrigger value="node">Node data</TabsTrigger>
          <TabsTrigger value="external">External URL</TabsTrigger>
        </TabsList>

        <TabsContent value="node">
          <div v-if="!s3.endpoint.value" class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>This node does not advertise an S3 endpoint, reference external data by URL instead.</span>
          </div>
          <div v-else-if="!s3.hasActiveKey.value" class="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
            <p class="flex items-center gap-2 font-medium text-foreground"><KeyRound class="h-3.5 w-3.5" /> S3 credentials needed to browse node data.</p>
            <Button v-if="currentUser" variant="outline" size="sm" @click="credentialDialogOpen = true">
              <Plus class="size-3.5" /> Create credentials
            </Button>
            <p v-else class="flex items-center gap-2"><LogIn class="h-3.5 w-3.5" /> Sign in first to create credentials.</p>
          </div>
          <template v-else>
            <p class="pb-2 text-[11px] text-muted-foreground">Click an object to use its content identity. Its <code class="rounded bg-muted px-1">s3://bucket/key</code> location is kept as <code class="rounded bg-muted px-1">contentUrl</code>.</p>
            <p v-if="resolving" class="flex items-center gap-2 pb-2 text-[11px] text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Resolving the content identity…</p>
            <ObjectBrowserPanel @select="pickObject" />
          </template>
        </TabsContent>

        <TabsContent value="external" class="space-y-3">
          <div>
            <label class="text-xs font-medium text-foreground">Label</label>
            <Input v-model="externalLabel" class="mt-1" placeholder="Raw sequencing reads" />
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">URL</label>
            <Input
              v-model="externalUrl"
              class="mt-1"
              placeholder="https://example.org/data.tar.gz or s3://bucket/key"
              :invalid="externalUrlInvalid ? 'error' : undefined"
              @keydown.enter="addExternal"
            />
            <p v-if="externalUrlInvalid" class="mt-1 text-[11px] text-destructive">Use a valid absolute URL (http(s)://, s3://, …).</p>
          </div>
          <div class="flex justify-end">
            <Button :disabled="!externalUrl.trim()" @click="addExternal">
              <Plus class="size-3.5" /> Add reference
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Close</Button></DialogClose>
      </DialogFooter>

      <CreateCredentialDialog v-model:open="credentialDialogOpen" />
    </DialogContent>
  </Dialog>
</template>
