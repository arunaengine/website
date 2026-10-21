<script setup lang="ts">
// One linked folder: its last run, its problems in plain sentences, a running step and the Organize panel.
import { computed, onMounted, ref, watch } from 'vue'
import JobProgress from '@/components/storage/JobProgress.vue'
import OrganizeDialog from '@/components/storage/OrganizeDialog.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useLinkState } from '@/composables/useLinkState'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import type { BackendImport } from '@/lib/api'
import { nameStyle, RUN_HINT, scheduleWords } from '@/lib/linkedFolders'
import { failureList, filesWord, linkProblems } from '@/lib/organize'
import { formatNumber, relativeTime } from '@/lib/utils'
import { Play, SlidersHorizontal } from '@lucide/vue'

const props = defineProps<{
  groupId: string
  link: BackendImport
  storage: string
  running: boolean
  runError?: string
  /** Opened from a link: scroll here and mark the card. */
  highlight?: boolean
}>()
const emit = defineEmits<{ (e: 'run'): void; (e: 'edit'): void }>()

const { writesDisabled } = useConnectivity()
const { renames, status, job, supported, error, controlling, finished, refresh, control } = useLinkState(
  () => props.groupId,
  () => props.link.import_id,
)

const root = ref<HTMLElement | null>(null)
const organizing = ref(false)
const details = ref<string | null>(null)

onMounted(() => {
  if (props.highlight) root.value?.scrollIntoView?.({ block: 'center' })
})

// A new list, a saved link or a finished run all change what the node can say.
watch(() => props.link, () => void refresh(), { immediate: true })

const problems = computed(() => linkProblems(props.link, renames.value, status.value))
const place = computed(() => props.link.key_prefix || props.link.bucket)
const sizeLine = computed(() => {
  const files = status.value?.files
  return files === undefined ? null : filesWord(files)
})

function show(id: string, action: 'show' | 'organize') {
  if (action === 'organize') organizing.value = true
  else details.value = details.value === id ? null : id
}
</script>

<template>
  <section
    :id="`link-${link.import_id}`"
    ref="root"
    :class="['surface overflow-hidden', highlight ? 'ring-2 ring-primary' : '']"
    data-testid="link-card"
  >
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
      <div class="min-w-0">
        <h3 class="truncate font-display text-sm font-semibold text-aruna-navy">
          <span class="font-mono">{{ place }}</span> ⇆ {{ storage }} / <span class="font-mono">{{ link.backend_prefix || '/' }}</span>
        </h3>
        <p class="mt-0.5 text-xs text-muted-foreground">
          <template v-if="link.last_run">
            Last run {{ relativeTime(link.last_run.started_at) }} · {{ formatNumber(link.last_run.imported) }} new {{ link.last_run.imported === 1 ? 'file' : 'files' }}
          </template>
          <template v-else>Not run yet</template>
          · {{ scheduleWords(link.schedule) }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : RUN_HINT"
          :aria-label="RUN_HINT"
          :disabled="running || writesDisabled"
          @click="emit('run')"
        >
          <Play class="size-3.5" /> Run now
        </Button>
        <Button variant="outline" size="sm" @click="organizing = true">Organize…</Button>
        <IconButton label="Change the link" @click="emit('edit')"><SlidersHorizontal class="size-3.5" /></IconButton>
      </div>
    </header>

    <div v-if="job" class="border-b border-border px-5 py-3">
      <JobProgress :job="job" :busy="controlling" @control="control" />
    </div>

    <div class="flex items-center gap-3 px-5 py-3">
      <div class="min-w-0 flex-1">
        <p v-if="sizeLine" class="text-sm">{{ sizeLine }}</p>
        <p class="text-xs text-muted-foreground">New files are named <span class="font-mono">{{ nameStyle(link.write_pattern) }}</span></p>
      </div>
      <span v-if="!problems.length && link.last_run" class="text-xs text-emerald-700 dark:text-emerald-300">✓ in sync</span>
    </div>

    <ul v-if="problems.length || runError" class="divide-y divide-border border-t border-border">
      <li v-for="problem in problems" :key="problem.id" class="px-5 py-3">
        <div class="flex items-start gap-3">
          <p class="min-w-0 flex-1 break-words text-xs text-amber-800 dark:text-amber-300">{{ problem.text }}</p>
          <Button variant="outline" size="sm" @click="show(problem.id, problem.action)">Show</Button>
        </div>
        <ul v-if="details === problem.id && problem.id === 'failed'" class="mt-2 space-y-0.5 text-[11px]">
          <li v-for="(item, at) in failureList(link, status?.conflicts ?? []).slice(0, 20)" :key="`${at}\n${item.path}`" class="break-all">
            <span class="font-mono">{{ item.path }}</span>: <span class="text-destructive">{{ item.reason }}</span>
          </li>
        </ul>
      </li>
      <li v-if="runError" class="break-all px-5 py-3 text-xs text-destructive">{{ runError }}</li>
    </ul>
    <p v-if="error" class="break-all border-t border-border px-5 py-3 text-xs text-destructive">{{ error }}</p>

    <OrganizeDialog
      v-model:open="organizing"
      :group-id="groupId"
      :link="link"
      :renames="renames"
      :job="job"
      :supported="supported"
      :controlling="controlling"
      :finished="finished"
      :error="error"
      @control="control"
      @refresh="refresh"
      @unsupported="supported = false"
    />
  </section>
</template>
