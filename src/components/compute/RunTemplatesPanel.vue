<script setup lang="ts">
// Run templates: the runs a person saved on this computer and the built-in templates, in one table.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Notice from '@/components/ui/Notice.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import KindTile from '@/components/compute/KindTile.vue'
import { useSavedRuns } from '@/composables/useSavedRuns'
import { askedFor, type SavedRun } from '@/lib/savedRuns'
import { RUN_TEMPLATES } from '@/lib/runTemplates'
import { errorMessage } from '@/lib/utils'
import { Download, Play, Star, Trash2, Upload } from '@lucide/vue'

const router = useRouter()
const saved = useSavedRuns()
const picker = ref<HTMLInputElement | null>(null)
const failure = ref<string | null>(null)
const done = ref<string | null>(null)
const runsWord = (count: number) => `${count} ${count === 1 ? 'run template' : 'run templates'}`

// The tool is the image name without its registry, path and tag.
function runsWith(run: SavedRun): string {
  const image = run.task.executors?.[0]?.image ?? ''
  return image.split('/').pop() || '-'
}

const total = computed(() => saved.runs.value.length + RUN_TEMPLATES.length)

function start(query: Record<string, string>) {
  void router.push({ name: 'compute-new', query })
}

function remove(run: SavedRun) {
  saved.remove(run.id)
  done.value = `Removed ${run.name}.`
}

function exportAll() {
  saved.exportFile()
  done.value = `Exported ${runsWord(saved.runs.value.length)} to my-runs.json.`
}

async function chosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  failure.value = null
  done.value = null
  const before = saved.runs.value.length
  try {
    await saved.importFile(file)
    done.value = `Imported ${runsWord(Math.max(0, saved.runs.value.length - before))}.`
  } catch (cause) {
    failure.value = errorMessage(cause)
  }
}
</script>

<template>
  <section>
    <SectionHeading title="Run templates" :icon="Star" info="Your own templates are saved only on this computer. Export them as a file to use them elsewhere.">
      <template #actions>
        <Button variant="outline" size="sm" @click="picker?.click()"><Upload class="h-3.5 w-3.5" /> Import</Button>
        <Button variant="outline" size="sm" :disabled="!saved.runs.value.length" @click="exportAll"><Download class="h-3.5 w-3.5" /> Export</Button>
        <input ref="picker" type="file" accept="application/json,.json" class="hidden" aria-label="Import run templates" @change="chosen" />
      </template>
    </SectionHeading>
    <p class="-mt-2 mb-4 text-sm text-muted-foreground">A run template is a saved tool, inputs and settings you can start again.</p>
    <Notice v-if="failure || saved.failure.value" tone="error" class="mb-4">{{ failure || saved.failure.value }}</Notice>
    <p v-else-if="done" role="status" class="mb-4 text-xs text-muted-foreground">{{ done }}</p>

    <div class="surface overflow-hidden">
      <div class="overflow-x-auto">
        <table class="data-table data-table-tall">
          <thead>
            <tr>
              <th class="hidden w-12 pl-5 pr-0 sm:table-cell"><span class="sr-only">Type</span></th>
              <th class="pl-5">Name</th>
              <th class="hidden sm:table-cell">Source</th>
              <th class="hidden sm:table-cell">Runs with</th>
              <th class="hidden lg:table-cell">Asks for</th>
              <th class="pr-4"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="run in saved.runs.value" :key="run.id">
              <td class="hidden w-12 pl-5 pr-0 sm:table-cell"><KindTile :icon="Star" tone="aqua" label="Your run template" /></td>
              <td class="pl-5">
                <span class="font-medium text-foreground">{{ run.name }}</span>
                <p class="mt-1 text-xs text-muted-foreground sm:hidden">Me, {{ runsWith(run) }}</p>
              </td>
              <td class="hidden whitespace-nowrap text-[13px] sm:table-cell">Me</td>
              <td class="hidden text-[13px] sm:table-cell">{{ runsWith(run) }}</td>
              <td class="hidden text-[13px] lg:table-cell">{{ askedFor(run).join(', ') || '-' }}</td>
              <td class="pr-4">
                <span class="flex items-center justify-end gap-1">
                  <Button variant="outline" size="sm" @click="start({ saved: run.id })"><Play class="h-3.5 w-3.5" /> Start</Button>
                  <IconButton :label="`Remove ${run.name}`" class="text-destructive hover:text-destructive" @click="remove(run)"><Trash2 class="h-4 w-4" /></IconButton>
                </span>
              </td>
            </tr>
            <tr v-for="entry in RUN_TEMPLATES" :key="entry.label">
              <td class="hidden w-12 pl-5 pr-0 sm:table-cell"><KindTile :icon="entry.icon" label="Built-in template" /></td>
              <td class="pl-5">
                <span class="font-medium text-foreground">{{ entry.label }}</span>
                <p class="mt-1 text-xs text-muted-foreground sm:hidden">Built in, {{ entry.runsWith }}</p>
              </td>
              <td class="hidden whitespace-nowrap text-[13px] sm:table-cell">Built in</td>
              <td class="hidden text-[13px] sm:table-cell">{{ entry.runsWith }}</td>
              <td class="hidden text-[13px] lg:table-cell">-</td>
              <td class="pr-4">
                <span class="flex items-center justify-end gap-1">
                  <Button variant="outline" size="sm" @click="start(entry.template ? { template: entry.template } : {})"><Play class="h-3.5 w-3.5" /> Start</Button>
                  <span class="inline-block w-8" aria-hidden="true" />
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="border-t border-border-subtle px-5 py-2 text-xs tabular-nums text-muted-foreground">
        {{ runsWord(total) }}, {{ saved.runs.value.length }} by me
      </div>
    </div>
  </section>
</template>
