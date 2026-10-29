<script setup lang="ts">
// The releases of a database bucket and a form to publish one. A release is a tagged file that
// pins the exact version of every file under a folder; the node that holds the bucket lists them.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { nodeClientReady } from '@/composables/aruna/state'
import { useAruna } from '@/composables/useAruna'
import { apiErrorMessage, getFileOrigin, getRun, type ReleaseItem, type ReleaseListResponse } from '@/lib/api'
import { pageIdentifier } from '@/lib/databases'
import { releaseKey, versionTime } from '@/lib/releases'
import { Plus } from '@lucide/vue'

const props = defineProps<{ bucket: string; nodeId: string | null; canPublish: boolean; page?: string }>()

const { listReleases, publishRelease, sessionEpoch } = useAruna()

const listed = ref<ReleaseListResponse | null>(null)
const failure = ref<string | null>(null)
const publishing = ref(false)
const form = ref({ label: '', prefix: '', page: '', key: '' })
const keyEdited = ref(false)
const busy = ref(false)
const published = ref<string | null>(null)
let runs = 0

// Who made each release, from its file's origin: a run links to its record, an upload was by hand.
type Maker = { text: string; record: string | null }
const makers = ref<Record<string, Maker>>({})
const UNKNOWN: Maker = { text: 'Unknown', record: null }

async function makerOf(item: ReleaseItem): Promise<Maker> {
  try {
    const client = await nodeClientReady(props.nodeId)
    const origin = await getFileOrigin(props.bucket, { key: item.key, version_id: item.version_id }, client)
    if (origin.origin?.kind === 'upload') return { text: 'By hand', record: null }
    if (origin.origin?.kind !== 'job') return UNKNOWN
    const run = await getRun(origin.origin.run_id, client).catch(() => null)
    return run?.run_crate ? { text: 'A run, open its record', record: run.run_crate } : { text: 'A run', record: null }
  } catch {
    return UNKNOWN
  }
}

async function load() {
  const run = ++runs
  try {
    const answer = await listReleases(props.bucket, props.nodeId)
    if (run !== runs) return
    listed.value = answer
    failure.value = null
    const found = await Promise.all(answer.releases.map(async (item) => [item.version_id, await makerOf(item)] as const))
    if (run === runs) makers.value = Object.fromEntries(found)
  } catch (cause) {
    if (run === runs) failure.value = apiErrorMessage(cause)
  }
}

watch(() => [props.bucket, props.nodeId], () => {
  listed.value = null
  publishing.value = false
  void load()
}, { immediate: true })
watch(() => sessionEpoch.value, () => void load())

watch(() => form.value.label, (label) => {
  if (!keyEdited.value) form.value.key = releaseKey(label)
})

function open() {
  form.value = { label: '', prefix: '', page: props.page ?? '', key: '' }
  keyEdited.value = false
  published.value = null
  publishing.value = true
}

const ready = computed(() => form.value.label.trim() && form.value.key.trim() && !busy.value)

async function publish() {
  busy.value = true
  failure.value = null
  try {
    const page = pageIdentifier(form.value.page)
    const answer = await publishRelease(props.bucket, {
      key: form.value.key.trim(),
      label: form.value.label.trim(),
      prefix: form.value.prefix.trim(),
      upstream: page ? [page] : [],
      preparation: [],
    }, props.nodeId)
    published.value = answer.replayed ? 'This release was already published.' : `Published with ${answer.files} files.`
    publishing.value = false
    void load()
  } catch (cause) {
    failure.value = apiErrorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="surface space-y-3 p-5">
    <div class="flex items-center gap-2">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Releases</h2>
      <Button v-if="canPublish && !publishing" size="sm" variant="outline" class="ml-auto" @click="open"><Plus class="h-3.5 w-3.5" /> Publish release</Button>
    </div>
    <Spinner v-if="!listed && !failure" show-label label="Reading the releases…" />
    <table v-else-if="listed?.releases.length" class="w-full text-left text-xs">
      <thead class="border-b border-border text-muted-foreground">
        <tr>
          <th class="py-2 font-medium">Version</th>
          <th class="py-2 font-medium">Files</th>
          <th class="py-2 font-medium">Made by</th>
          <th class="py-2 font-medium">Published</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        <tr v-for="item in listed.releases" :key="item.version_id">
          <td class="py-2.5 font-medium" :title="item.key">{{ item.label }}</td>
          <td class="py-2.5"><span v-if="item.prefix" class="font-mono">{{ item.prefix }}</span><template v-else>Whole bucket</template></td>
          <td class="py-2.5">
            <RouterLink
              v-if="makers[item.version_id]?.record"
              :to="{ name: 'dataset', params: { id: makers[item.version_id]!.record! } }"
              class="text-primary hover:underline"
            >{{ makers[item.version_id]!.text }}</RouterLink>
            <span v-else :class="makers[item.version_id] ? '' : 'text-muted-foreground'">{{ makers[item.version_id]?.text ?? '…' }}</span>
          </td>
          <td class="py-2.5 text-muted-foreground">{{ versionTime(item.version_id)?.toLocaleDateString() ?? 'Unknown' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="listed" class="text-xs text-muted-foreground">No releases yet.</p>
    <p v-if="listed && !listed.complete" class="text-xs text-muted-foreground">This node does not hold every part of the bucket, so releases may be missing.</p>
    <p v-if="published" role="status" class="text-xs text-muted-foreground">{{ published }}</p>

    <div v-if="publishing" class="space-y-3 rounded-md border border-border bg-muted/40 p-4">
      <div class="grid gap-3 text-sm sm:grid-cols-[11rem_1fr] sm:items-center">
        <label for="release-label" class="text-muted-foreground">Version</label>
        <Input id="release-label" v-model="form.label" placeholder="6.0 (full)" />
        <label for="release-prefix" class="text-muted-foreground">Folder with the files</label>
        <Input id="release-prefix" v-model="form.prefix" class="font-mono text-xs" placeholder="db/ (empty for the whole bucket)" />
        <label for="release-page" class="text-muted-foreground">Source (DOI or link)</label>
        <Input id="release-page" v-model="form.page" class="font-mono text-xs" />
        <label for="release-key" class="text-muted-foreground">Save the release file as</label>
        <Input id="release-key" v-model="form.key" class="font-mono text-xs" @input="keyEdited = true" />
      </div>
      <p class="text-xs text-muted-foreground">The release pins the exact version of every file and cannot be changed later.</p>
      <div class="flex items-center gap-2">
        <Button size="sm" :disabled="!ready" @click="publish">Publish</Button>
        <Button size="sm" variant="ghost" @click="publishing = false">Cancel</Button>
        <Spinner v-if="busy" />
      </div>
    </div>
    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
  </section>
</template>
