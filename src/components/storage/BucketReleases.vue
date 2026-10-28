<script setup lang="ts">
// The releases of a database bucket and a form to publish one. A release is a tagged file that
// pins the exact version of every file under a folder; the node that holds the bucket lists them.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import { apiErrorMessage, type ReleaseListResponse } from '@/lib/api'
import { pageIdentifier } from '@/lib/databases'
import { releaseKey } from '@/lib/releases'

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

async function load() {
  const run = ++runs
  try {
    const answer = await listReleases(props.bucket, props.nodeId)
    if (run !== runs) return
    listed.value = answer
    failure.value = null
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
  <div class="space-y-3 border-t border-border pt-4">
    <div class="flex items-center gap-2">
      <h3 class="text-sm font-medium text-foreground">Releases</h3>
      <Button v-if="canPublish && !publishing" size="sm" variant="outline" class="ml-auto" @click="open">Publish release</Button>
    </div>
    <Spinner v-if="!listed && !failure" show-label label="Reading the releases…" />
    <table v-else-if="listed?.releases.length" class="w-full text-left text-sm">
      <thead class="text-xs text-muted-foreground">
        <tr><th class="py-1 font-medium">Release</th><th class="py-1 font-medium">File</th><th class="py-1 font-medium">Folder</th></tr>
      </thead>
      <tbody>
        <tr v-for="item in listed.releases" :key="item.version_id" class="border-t border-border">
          <td class="py-1.5">{{ item.label }}</td>
          <td class="py-1.5 font-mono text-xs">{{ item.key }}</td>
          <td class="py-1.5 font-mono text-xs">{{ item.prefix || 'Whole bucket' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="listed" class="text-xs text-muted-foreground">No releases yet.</p>
    <p v-if="listed && !listed.complete" class="text-xs text-muted-foreground">This node does not hold every part of the bucket, so releases may be missing.</p>
    <Notice v-if="published" tone="success">{{ published }}</Notice>

    <div v-if="publishing" class="space-y-3 rounded-md border border-border bg-muted/40 p-4">
      <div class="grid gap-3 sm:grid-cols-[11rem_1fr] sm:items-center">
        <label for="release-label" class="text-muted-foreground">Version</label>
        <Input id="release-label" v-model="form.label" placeholder="6.0 (full)" />
        <label for="release-prefix" class="text-muted-foreground">Folder with the files</label>
        <Input id="release-prefix" v-model="form.prefix" class="font-mono text-xs" placeholder="db/ (empty for the whole bucket)" />
        <label for="release-page" class="text-muted-foreground">Source (DOI or link)</label>
        <Input id="release-page" v-model="form.page" class="font-mono text-xs" />
        <label for="release-key" class="text-muted-foreground">Save the release file as</label>
        <Input id="release-key" v-model="form.key" class="font-mono text-xs" @input="keyEdited = true" />
      </div>
      <p class="text-xs text-muted-foreground">
        The release lists the exact version of every file. It is a normal file with a release tag and cannot be changed later.
      </p>
      <div class="flex items-center gap-2">
        <Button size="sm" :disabled="!ready" @click="publish">Publish</Button>
        <Button size="sm" variant="ghost" @click="publishing = false">Cancel</Button>
        <Spinner v-if="busy" />
      </div>
    </div>
    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
  </div>
</template>
