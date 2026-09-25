<script setup lang="ts">
// What changed between two versions: metadata properties before and after,
// then the changed files, collapsed. Without `from` everything counts as added.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import type { DatasetHistoryState } from '@/composables/useDatasetHistory'
import { compareVersions, type VersionComparison } from '@/lib/api'
import { propertyRow, shortVersion } from '@/lib/versions'
import { errorMessage } from '@/lib/utils'
import { ArrowRight } from '@lucide/vue'

const props = defineProps<{ history: DatasetHistoryState; from: string; to: string }>()
const open = defineModel<boolean>('open', { required: true })

const from = ref(props.from)
const to = ref(props.to)
const result = ref<VersionComparison | null>(null)
const loading = ref(false)
const error = ref('')

// Branches, tags and the loaded versions; a picked value stays listed.
const options = computed(() => {
  const list = [
    ...(props.history.branches.value ?? []).map((branch) => ({ value: branch.name, label: branch.name })),
    ...props.history.tags.value.map((tag) => ({ value: tag.name, label: tag.name })),
    ...(props.history.versions.value ?? []).map((version) => ({
      value: version.version,
      label: `${shortVersion(version.version)} ${version.message}`,
    })),
  ]
  for (const value of [from.value, to.value]) {
    if (value && !list.some((option) => option.value === value)) list.push({ value, label: shortVersion(value) })
  }
  return list
})
const fromOptions = computed(() => [{ value: '', label: 'Nothing (first version)' }, ...options.value])

const rows = computed(() =>
  (result.value?.entities ?? []).map((entity) => ({
    entity,
    properties: entity.properties.map(propertyRow),
  })),
)

let token = 0
async function load() {
  const current = ++token
  const documentId = props.history.documentId.value
  result.value = null
  error.value = ''
  loading.value = true
  try {
    const answer = await compareVersions(documentId, to.value, from.value || undefined, props.history.client())
    if (current !== token || documentId !== props.history.documentId.value) return
    result.value = answer
  } catch (err) {
    if (current === token) error.value = errorMessage(err)
  } finally {
    if (current === token) loading.value = false
  }
}

watch(open, (isOpen) => {
  if (!isOpen) return
  from.value = props.from
  to.value = props.to
  void load()
}, { immediate: true })
watch([from, to], () => {
  if (open.value) void load()
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Changes</DialogTitle>
        <DialogDescription>What changed in the metadata between two versions.</DialogDescription>
      </DialogHeader>

      <div class="flex flex-wrap items-center gap-2 text-sm">
        <Select v-model="from" :options="fromOptions" label="From" aria-label="Compare from" class="h-8 w-56 text-xs" />
        <ArrowRight class="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <Select v-model="to" :options="options" label="To" aria-label="Compare to" class="h-8 w-56 text-xs" />
        <span v-if="result?.entities" class="ml-auto text-xs text-muted-foreground">
          {{ result.entities.length === 1 ? '1 entity changed' : `${result.entities.length} entities changed` }}
        </span>
      </div>

      <Spinner v-if="loading" label="Comparing versions" show-label />
      <div v-else-if="error" class="space-y-2">
        <Notice tone="error">{{ error }}</Notice>
        <Button variant="outline" size="sm" @click="load">Try again</Button>
      </div>
      <template v-else-if="result">
        <Notice v-if="result.entities === null">
          Metadata comparison is not available for these versions; only file changes are listed.
        </Notice>
        <p v-else-if="!rows.length" class="text-sm text-muted-foreground">No metadata changes.</p>
        <div v-else class="overflow-x-auto rounded-md border border-border">
          <table class="w-full text-sm">
            <thead class="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th class="px-3 py-2 text-left font-semibold">Entity</th>
                <th class="px-3 py-2 text-left font-semibold">Property</th>
                <th class="px-3 py-2 text-left font-semibold">Before</th>
                <th class="px-3 py-2 text-left font-semibold">After</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in rows" :key="row.entity.id">
                <tr v-for="(property, index) in row.properties.length ? row.properties : [null]" :key="property?.name ?? ''" class="border-t border-border align-top">
                  <td v-if="index === 0" :rowspan="Math.max(row.properties.length, 1)" class="px-3 py-2">
                    <span class="font-medium text-foreground">{{ row.entity.label || row.entity.id }}</span>
                    <Badge v-if="row.entity.change === 'added'" variant="success" size="sm" class="ml-1.5">added</Badge>
                    <Badge v-else-if="row.entity.change === 'removed'" variant="destructive" size="sm" class="ml-1.5">removed</Badge>
                    <span v-if="row.entity.label" class="block font-mono text-[11px] text-muted-foreground">{{ row.entity.id }}</span>
                  </td>
                  <template v-if="property">
                    <td class="px-3 py-2 font-mono text-xs">{{ property.name }}</td>
                    <td class="bg-destructive/5 px-3 py-2 text-xs">
                      <template v-if="property.multiple">
                        <span class="text-muted-foreground">{{ property.before.length ? 'Removed:' : 'Nothing removed' }}</span>
                        <span v-for="value in property.before" :key="value" class="block break-words">{{ value }}</span>
                      </template>
                      <template v-else>
                        <span v-for="value in property.before" :key="value" class="block break-words">{{ value }}</span>
                      </template>
                    </td>
                    <td class="bg-emerald-500/5 px-3 py-2 text-xs">
                      <template v-if="property.multiple">
                        <span class="text-muted-foreground">{{ property.after.length ? 'Added:' : 'Nothing added' }}</span>
                        <span v-for="value in property.after" :key="value" class="block break-words">{{ value }}</span>
                      </template>
                      <template v-else>
                        <span v-for="value in property.after" :key="value" class="block break-words">{{ value }}</span>
                      </template>
                    </td>
                  </template>
                  <td v-else colspan="3" class="px-3 py-2 text-xs text-muted-foreground">No property changes listed.</td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <details v-if="result.files.length">
          <summary class="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            {{ result.files.length === 1 ? '1 file changed' : `${result.files.length} files changed` }}
          </summary>
          <ul class="mt-2 space-y-1 font-mono text-xs">
            <li v-for="file in result.files" :key="file.path">
              <span class="inline-block w-16 text-muted-foreground">{{ file.change }}</span> {{ file.path }}
            </li>
          </ul>
        </details>
        <p v-else class="text-xs text-muted-foreground">No file changes.</p>
      </template>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Close</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
