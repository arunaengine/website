<script setup lang="ts">
// In the home realm's popup: pick the dataset and what travels to the other realm.
// Metadata only is the default; files are copied only when checked.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import { fetchRoCrateRaw } from '@/composables/aruna/crates'
import { hasLocalIdentity } from '@/lib/crate/dataIdentity'
import { dataEntitiesOf, isLeafFile, type DataEntity } from '@/lib/dataEntities'
import type { VerifiedRealm } from '@/lib/federation/descriptor'
import { errorMessage, formatBytes } from '@/lib/utils'
import { FileText, Search } from '@lucide/vue'

const props = defineProps<{ serving: VerifiedRealm; homeName: string; busy: boolean }>()
const emit = defineEmits<{
  (e: 'send', choice: { documentId: string; title: string; files: string[] }): void
  (e: 'cancel'): void
}>()

const { metadata, realm } = useAruna()
const query = ref('')
const documentId = ref('')
const withFiles = ref(false)
const files = ref<DataEntity[] | null>(null)
const checked = ref<string[]>([])
const linked = ref(0)
const filesError = ref<string | null>(null)
let loadGeneration = 0

const matches = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return metadata.value
    .filter((doc) => !needle || doc.title.toLowerCase().includes(needle))
    .slice(0, 50)
})
const chosen = computed(() => metadata.value.find((doc) => doc.ulid === documentId.value) ?? null)

watch(documentId, async (id) => {
  const generation = ++loadGeneration
  files.value = null
  checked.value = []
  linked.value = 0
  filesError.value = null
  if (!id) return
  try {
    const crate = await fetchRoCrateRaw(id)
    if (generation !== loadGeneration) return
    const all = dataEntitiesOf(crate).filter((entity) => isLeafFile(entity.types))
    files.value = all.filter((entity) => hasLocalIdentity(entity, realm.value.id))
    linked.value = all.length - files.value.length
  } catch (error) {
    if (generation === loadGeneration) filesError.value = errorMessage(error)
  }
})

watch(withFiles, (on) => {
  if (on && files.value && !checked.value.length) checked.value = files.value.map((file) => file.id)
})

function size(file: DataEntity) {
  const bytes = Number(file.contentSize)
  return Number.isFinite(bytes) && file.contentSize ? formatBytes(bytes) : ''
}

function send() {
  if (!chosen.value) return
  emit('send', {
    documentId: chosen.value.ulid,
    title: chosen.value.title,
    files: withFiles.value ? [...checked.value] : [],
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="font-display text-lg font-semibold text-foreground">
      Send {{ chosen?.title || 'a dataset' }} to {{ serving.name }}
    </h1>

    <div v-if="!chosen">
      <label for="export-choice-query" class="text-xs font-medium text-foreground">Dataset</label>
      <div class="relative mt-1">
        <Search class="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input id="export-choice-query" v-model="query" placeholder="Search datasets" class="pl-8" />
      </div>
      <p v-if="!matches.length" class="mt-3 text-sm text-muted-foreground">No datasets found.</p>
      <ul v-else class="mt-2 max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
        <li v-for="doc in matches" :key="doc.ulid">
          <button type="button" class="w-full px-3 py-2 text-left text-sm hover:bg-muted/60" @click="documentId = doc.ulid">
            {{ doc.title }}
          </button>
        </li>
      </ul>
    </div>

    <template v-else>
      <fieldset class="space-y-2">
        <legend class="mb-1.5 text-xs font-medium text-foreground">What to import</legend>
        <label
          class="flex cursor-pointer gap-2.5 rounded-md border px-3 py-2.5"
          :class="!withFiles ? 'border-primary ring-1 ring-primary' : 'border-border'"
        >
          <input v-model="withFiles" type="radio" :value="false" class="mt-1" />
          <span>
            <span class="block text-sm font-semibold">Metadata only</span>
            <span class="block text-[11px] text-muted-foreground">Files stay at {{ homeName }}.</span>
          </span>
        </label>
        <label
          class="flex cursor-pointer gap-2.5 rounded-md border px-3 py-2.5"
          :class="withFiles ? 'border-primary ring-1 ring-primary' : 'border-border'"
        >
          <input v-model="withFiles" type="radio" :value="true" class="mt-1" />
          <span>
            <span class="block text-sm font-semibold">Metadata and files</span>
            <span class="block text-[11px] text-muted-foreground">Only checked files will be copied.</span>
          </span>
        </label>
      </fieldset>

      <fieldset :disabled="!withFiles" class="disabled:opacity-50">
        <legend class="mb-1.5 text-xs font-medium text-foreground">Files</legend>
        <Notice v-if="filesError" tone="error">{{ filesError }}</Notice>
        <Spinner v-else-if="!files" show-label label="Loading files…" class="text-xs" />
        <p v-else-if="!files.length" class="text-sm text-muted-foreground">This dataset has no files to copy.</p>
        <div v-else class="divide-y divide-border rounded-md border border-border">
          <label v-for="file in files" :key="file.id" class="flex items-center gap-2.5 px-3 py-2 text-sm">
            <input v-model="checked" type="checkbox" :value="file.id" />
            <FileText class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ file.name || file.id }}</span>
            <span class="text-xs text-muted-foreground">{{ size(file) }}</span>
          </label>
        </div>
        <p v-if="files && linked" class="mt-1.5 text-[11px] text-muted-foreground">
          {{ linked }} linked {{ linked === 1 ? 'file stays a link' : 'files stay links' }}.
        </p>
      </fieldset>
    </template>

    <div class="flex justify-end gap-2">
      <Button variant="outline" :disabled="busy" @click="chosen ? (documentId = '') : emit('cancel')">
        {{ chosen ? 'Back' : 'Cancel' }}
      </Button>
      <Button v-if="chosen" :disabled="busy || (withFiles && !checked.length && files?.length !== 0)" @click="send">
        <Spinner v-if="busy" class="text-current" aria-hidden="true" /> Send to {{ serving.name }}
      </Button>
    </div>
  </div>
</template>
