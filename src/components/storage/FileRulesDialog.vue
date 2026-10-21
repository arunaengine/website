<script setup lang="ts">
// Name rules that sort new files of a linked folder into folders, with a preview first.
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { computed, ref, watch } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import {
  getFileRules,
  previewFileRules,
  saveFileRules,
  type BackendImport,
  type FileRule,
  type FileRulePreview,
} from '@/lib/api'
import { cleanRules, OUTCOME_WORDS, previewCounts, ruleProblem } from '@/lib/fileRules'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{ open: boolean; groupId: string; link: BackendImport | null }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { writesDisabled } = useConnectivity()

const rules = ref<FileRule[]>([])
const files = ref<FileRulePreview[]>([])
const next = ref<string | null>(null)
const previewed = ref(false)
const loading = ref(false)
// Saving replaces every rule, so it needs the stored rules first.
const loaded = ref(false)
const busy = ref(false)
const unsupported = ref(false)
const error = ref<string | null>(null)
const saved = ref(false)
let requestId = 0

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

// An answer counts only for the rules it was asked for.
function ruleKey() {
  return JSON.stringify(cleanRules(rules.value))
}

async function load() {
  const id = ++requestId
  const link = props.link
  rules.value = []
  files.value = []
  next.value = null
  previewed.value = false
  error.value = null
  saved.value = false
  unsupported.value = false
  loaded.value = false
  busy.value = false
  if (!link) return
  loading.value = true
  try {
    const stored = await getFileRules(props.groupId, link.import_id, client())
    if (id !== requestId) return
    rules.value = stored.rules.length ? stored.rules : [{ pattern: '', folder: '' }]
    loaded.value = true
  } catch (err) {
    if (id !== requestId) return
    if (isUnsupportedEndpoint(err)) unsupported.value = true
    else error.value = errorMessage(err)
  } finally {
    if (id === requestId) loading.value = false
  }
}

watch(
  () => [props.open, props.link?.import_id, sessionEpoch.value],
  () => {
    if (props.open) void load()
  },
  { immediate: true },
)

// A changed rule makes an old preview wrong.
watch(rules, () => {
  previewed.value = false
  saved.value = false
}, { deep: true })

const counts = computed(() => previewCounts(files.value))
const problems = computed(() => rules.value.map(ruleProblem))
const invalid = computed(() => problems.value.some(Boolean))

async function preview(more = false) {
  const link = props.link
  if (!link || busy.value || !loaded.value || invalid.value) return
  const id = ++requestId
  const sent = ruleKey()
  busy.value = true
  error.value = null
  try {
    const page = await previewFileRules(
      props.groupId,
      link.import_id,
      cleanRules(rules.value),
      more ? next.value : null,
      client(),
    )
    if (id !== requestId || sent !== ruleKey()) return
    files.value = more ? [...files.value, ...page.files] : page.files
    next.value = page.next ?? null
    previewed.value = true
  } catch (err) {
    if (id === requestId) error.value = errorMessage(err)
  } finally {
    if (id === requestId) busy.value = false
  }
}

async function save() {
  const link = props.link
  if (!link || busy.value || !loaded.value || !previewed.value || invalid.value || writesDisabled.value) return
  const id = ++requestId
  const sent = ruleKey()
  busy.value = true
  error.value = null
  try {
    await saveFileRules(props.groupId, link.import_id, cleanRules(rules.value), client())
    if (id !== requestId) return
    saved.value = sent === ruleKey()
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
        <DialogTitle>Sort new files</DialogTitle>
        <DialogDescription>
          New files that match a name go into a folder. Other files stay where they are. Files Aruna already knows never move.
        </DialogDescription>
      </DialogHeader>

      <Notice v-if="unsupported">This node cannot sort files yet.</Notice>
      <div v-else-if="loading" class="flex justify-center py-6"><Spinner /></div>
      <div v-else-if="loaded" class="max-h-[60vh] space-y-3 overflow-y-auto px-1 scrollbar-thin">
        <div v-for="(rule, index) in rules" :key="index">
          <div class="flex items-center gap-2">
            <Input v-model="rule.pattern" placeholder="*.faa.gz" aria-label="File name" class="font-mono" />
            <span class="shrink-0 text-xs text-muted-foreground">goes to</span>
            <Input v-model="rule.folder" placeholder="proteins/" aria-label="Folder" class="font-mono" />
            <Button variant="ghost" size="icon-sm" aria-label="Remove" @click="rules.splice(index, 1)">
              <Trash2 class="size-3.5" />
            </Button>
          </div>
          <p v-if="problems[index]" class="mt-1 text-[11px] text-destructive">{{ problems[index] }}</p>
        </div>
        <Button variant="outline" size="sm" @click="rules.push({ pattern: '', folder: '' })">
          <Plus class="size-3.5" /> Add a name
        </Button>
        <p class="text-[11px] text-muted-foreground">
          <span class="font-mono">*</span> stands for any text. A file may match only one name.
        </p>

        <template v-if="previewed">
          <p class="text-xs text-foreground">
            <template v-if="next">Shown so far: </template>{{ counts.matched }} sorted, {{ counts.unmatched }} stay<template v-if="counts.conflicts">,
              {{ counts.conflicts }} conflict and are skipped</template>.
          </p>
          <ul class="divide-y divide-border rounded-md border border-border text-xs">
            <li v-for="file in files" :key="file.path" class="flex items-center gap-2 px-3 py-1.5">
              <span class="w-20 shrink-0 text-[11px] text-muted-foreground">{{ OUTCOME_WORDS[file.outcome] }}</span>
              <span class="min-w-0 flex-1 truncate font-mono" :title="file.path">{{ file.path }}</span>
              <span class="min-w-0 flex-1 truncate font-mono" :title="file.key ?? ''">
                {{ file.key ?? file.patterns?.join(', ') }}
              </span>
            </li>
            <li v-if="!files.length" class="px-3 py-2 text-muted-foreground">No files in this folder.</li>
          </ul>
          <Button v-if="next" variant="ghost" size="sm" :disabled="busy" @click="preview(true)">Show more</Button>
        </template>
      </div>

      <Notice v-if="error" tone="error">{{ error }}</Notice>
      <Notice v-if="saved" tone="success">Saved. The next run uses these names.</Notice>
      <DialogFooter v-if="!unsupported && !loading">
        <Button v-if="!loaded" variant="outline" @click="load">Try again</Button>
        <Button variant="outline" :disabled="busy || !loaded || invalid" @click="preview()">Show where files go</Button>
        <Button
          :disabled="busy || !loaded || !previewed || invalid || writesDisabled"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          @click="save"
        >
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
