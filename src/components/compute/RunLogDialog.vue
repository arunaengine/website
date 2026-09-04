<script setup lang="ts">
// The whole captured log: one tab per stream, searched and numbered in place.
import { computed, ref, watch } from 'vue'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import { Download } from '@lucide/vue'

export interface LogStream {
  key: string
  label: string
  text: string
}

// A leading RFC3339 stamp is the only timestamp form a node emits; without one
// the toggle stays hidden rather than offering a switch that does nothing.
const STAMPED = /^(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))\s+(.*)$/

const props = withDefaults(
  defineProps<{ open: boolean; streams: readonly LogStream[]; name?: string }>(),
  { name: 'run' },
)
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const active = ref(props.streams[0]?.key ?? '')
const find = ref('')
const wrap = ref(true)
const stamps = ref(true)

watch(
  () => [props.open, props.streams] as const,
  ([open, streams]) => {
    if (!open) return
    if (!streams.some((stream) => stream.key === active.value)) active.value = streams[0]?.key ?? ''
  },
  { immediate: true },
)

const current = computed(() => props.streams.find((stream) => stream.key === active.value))
const lines = computed(() => (current.value?.text ? current.value.text.split('\n') : []))
const timestamped = computed(() => lines.value.some((line) => STAMPED.test(line)))

function displayed(line: string): string {
  if (stamps.value || !timestamped.value) return line
  return line.replace(STAMPED, '$2')
}

interface Segment {
  text: string
  hit: boolean
}
function segments(line: string, needle: string): Segment[] {
  if (!needle) return [{ text: line, hit: false }]
  const parts: Segment[] = []
  const haystack = line.toLowerCase()
  const target = needle.toLowerCase()
  let at = 0
  for (let found = haystack.indexOf(target); found !== -1; found = haystack.indexOf(target, at)) {
    if (found > at) parts.push({ text: line.slice(at, found), hit: false })
    parts.push({ text: line.slice(found, found + needle.length), hit: true })
    at = found + needle.length
  }
  if (at < line.length) parts.push({ text: line.slice(at), hit: false })
  return parts
}

const rows = computed(() => {
  const needle = find.value.trim()
  return lines.value
    .map((line, index) => ({ number: index + 1, text: displayed(line) }))
    .filter((row) => !needle || row.text.toLowerCase().includes(needle.toLowerCase()))
    .map((row) => ({ ...row, parts: segments(row.text, needle) }))
})

function lineCount(stream: LogStream): number {
  return stream.text ? stream.text.split('\n').length : 0
}

function download() {
  const stream = current.value
  if (!stream) return
  const url = URL.createObjectURL(new Blob([stream.text], { type: 'text/plain' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${props.name}-${stream.key}.log`
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <DetailDialog :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <template #header>
      <DialogTitle class="font-display text-base font-semibold text-aruna-navy">Run log</DialogTitle>
      <p class="mt-0.5 text-[11px] text-muted-foreground">Captured output of {{ name }}.</p>
    </template>

    <div class="flex h-full min-h-0 flex-col gap-3">
      <Tabs v-model="active">
        <TabsList>
          <TabsTrigger v-for="stream in streams" :key="stream.key" :value="stream.key">
            {{ stream.label }} ({{ lineCount(stream) }})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div class="flex flex-wrap items-center gap-2">
        <Input v-model="find" class="h-8 max-w-xs" placeholder="Find in this stream" aria-label="Find in this stream" />
        <Button variant="outline" size="sm" :aria-pressed="wrap" @click="wrap = !wrap">
          {{ wrap ? 'No wrap' : 'Wrap lines' }}
        </Button>
        <Button v-if="timestamped" variant="outline" size="sm" :aria-pressed="stamps" @click="stamps = !stamps">
          {{ stamps ? 'Hide timestamps' : 'Show timestamps' }}
        </Button>
        <Button variant="outline" size="sm" class="ml-auto" @click="download">
          <Download class="h-3.5 w-3.5" /> Download
        </Button>
      </div>

      <div
        class="scrollbar-thin min-h-0 flex-1 overflow-auto rounded-md border border-border bg-muted/30 py-2 font-mono text-[11px] leading-relaxed"
      >
        <p v-if="!lines.length" class="px-3 text-muted-foreground">This stream is empty.</p>
        <p v-else-if="!rows.length" class="px-3 text-muted-foreground">No line matches {{ find }}.</p>
        <div v-for="row in rows" :key="row.number" class="flex gap-3 px-3">
          <span class="w-10 shrink-0 select-none text-right tabular-nums text-muted-foreground">{{ row.number }}</span>
          <span :class="wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'">
            <span
              v-for="(part, i) in row.parts"
              :key="i"
              :class="part.hit ? 'rounded bg-amber-200 text-amber-900 dark:bg-amber-500/40 dark:text-amber-100' : ''"
            >{{ part.text }}</span>
          </span>
        </div>
      </div>
    </div>

    <template #footer>
      <p class="text-[11px] text-muted-foreground">
        {{ rows.length }} of {{ lines.length }} line{{ lines.length === 1 ? '' : 's' }} shown.
      </p>
    </template>
  </DetailDialog>
</template>
