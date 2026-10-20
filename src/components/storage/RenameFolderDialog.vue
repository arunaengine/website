<script setup lang="ts">
// Renames a folder of a bucket. The preview fixes the files; only those move.
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { computed, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { previewRename, renameKeys, type RenamePlan } from '@/lib/api'
import { canRename, folderValue } from '@/lib/fileRules'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{ open: boolean; bucket: string; from?: string }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'renamed'): void }>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()

const from = ref('')
const to = ref('')
const plan = ref<RenamePlan | null>(null)
// The folders the plan was made for; a rename sends these, never the current fields.
let planned = { from: '', to: '' }
const busy = ref(false)
const error = ref<string | null>(null)
const done = ref<number | null>(null)
let requestId = 0

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

watch(
  () => [props.open, props.bucket, sessionEpoch.value],
  () => {
    requestId++
    from.value = props.from ?? ''
    to.value = ''
    plan.value = null
    error.value = null
    done.value = null
    busy.value = false
  },
  { immediate: true },
)

// Other folders need a new preview.
watch([from, to], () => {
  plan.value = null
})

const conflicts = computed(() => plan.value?.items.filter((item) => item.conflict).length ?? 0)

async function preview() {
  if (busy.value) return
  const id = ++requestId
  busy.value = true
  error.value = null
  done.value = null
  const folders = { from: folderValue(from.value), to: folderValue(to.value) }
  try {
    const result = await previewRename(props.bucket, folders.from, folders.to, client())
    const current = folderValue(from.value) === folders.from && folderValue(to.value) === folders.to
    if (id === requestId && current) {
      plan.value = result
      planned = folders
    }
  } catch (err) {
    if (id === requestId) error.value = errorMessage(err)
  } finally {
    if (id === requestId) busy.value = false
  }
}

async function apply() {
  const current = plan.value
  if (busy.value || !canRename(current) || !current) return
  const id = ++requestId
  busy.value = true
  error.value = null
  const keys = current.items.map((item) => item.from)
  try {
    const result = await renameKeys(props.bucket, planned.from, planned.to, keys, client())
    if (id !== requestId) return
    done.value = result.items.length
    plan.value = null
    emit('renamed')
  } catch (err) {
    if (id === requestId) error.value = errorMessage(err)
  } finally {
    if (id === requestId) busy.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Rename a folder</DialogTitle>
        <DialogDescription>
          Files get new names in Aruna. Your storage and all versions stay as they are.
          Links by path stop working. DRS links by content keep working.
        </DialogDescription>
      </DialogHeader>

      <div class="max-h-[60vh] space-y-3 overflow-y-auto px-1 scrollbar-thin">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1">
            <label class="text-xs font-medium text-foreground" for="rename-from">Folder</label>
            <Input id="rename-from" v-model="from" placeholder="empty for the whole bucket" class="font-mono" />
          </div>
          <div class="space-y-1">
            <label class="text-xs font-medium text-foreground" for="rename-to">New folder</label>
            <Input id="rename-to" v-model="to" placeholder="archive/" class="font-mono" />
          </div>
        </div>

        <template v-if="plan">
          <p class="text-xs text-foreground">
            {{ plan.items.length }} {{ plan.items.length === 1 ? 'file' : 'files' }}<template v-if="conflicts">,
              {{ conflicts }} cannot move</template>.
          </p>
          <Notice v-if="plan.truncated" tone="warning">Only the first 1000 files. Rename the rest after this.</Notice>
          <ul class="divide-y divide-border rounded-md border border-border text-xs">
            <li v-for="item in plan.items" :key="item.from" class="px-3 py-1.5">
              <div class="flex items-center gap-2">
                <span class="min-w-0 flex-1 truncate font-mono" :title="item.from">{{ item.from }}</span>
                <span class="shrink-0 text-muted-foreground">→</span>
                <span class="min-w-0 flex-1 truncate font-mono" :title="item.to">{{ item.to }}</span>
                <span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {{ item.versions.length }} {{ item.versions.length === 1 ? 'version' : 'versions' }}
                </span>
              </div>
              <p v-if="item.conflict" class="mt-0.5 text-[11px] text-destructive">{{ item.conflict }}</p>
            </li>
            <li v-if="!plan.items.length" class="px-3 py-2 text-muted-foreground">No files in this folder.</li>
          </ul>
        </template>
      </div>

      <Notice v-if="error" tone="error">{{ error }}</Notice>
      <Notice v-if="done !== null" tone="success">Renamed {{ done }} {{ done === 1 ? 'file' : 'files' }}.</Notice>
      <DialogFooter>
        <Button variant="outline" :disabled="busy" @click="preview">Show changes</Button>
        <Button :disabled="busy || !canRename(plan)" @click="apply">Rename</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
