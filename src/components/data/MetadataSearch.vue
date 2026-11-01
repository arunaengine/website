<script setup lang="ts">
// The whole-bucket search behind the file list's one box: words match file names and search
// columns, `column=value` matches a filter column exactly and becomes a chip. The list bar owns the
// text; this view searches with it and shows the results in place of the folder. The files of one
// record folder, such as an assembly, are one row named by their kept metadata.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import Button from '@/components/ui/Button.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import type { ObjectSearchHit } from '@/lib/api'
import { groupFiles, groupHits, groupTitle, type SearchRow } from '@/lib/searchGroups'
import { searchQuery, searchTerms } from '@/lib/tableImport'
import { errorMessage, formatBytes } from '@/lib/utils'
import { ArrowLeft, ChevronRight, Dna, FolderOpen, Hash, Search, X } from '@lucide/vue'

/** `nodeId` is the node of the open bucket; null for the connected node. */
const props = defineProps<{ bucket: string; nodeId: string | null }>()
const emit = defineEmits<{ open: [hit: ObjectSearchHit]; back: [] }>()
// The box text, held here as before so the search's own edits (chips out, a quote closed) take effect
// at once; the two stay equal both ways.
const text = defineModel<string>('text', { default: '' })
const typed = ref(text.value)
watch(text, (value) => {
  if (value !== typed.value) typed.value = value
}, { flush: 'sync' })
watch(typed, (value) => {
  if (value !== text.value) text.value = value
}, { flush: 'sync' })

const { displayName, isLocalNode } = useRealmNodes()
// The search spans nodes by bucket name; a hit of another node names that node.
const elsewhere = (hit: ObjectSearchHit) => (props.nodeId ? hit.issuer_node_id !== props.nodeId : !isLocalNode(hit.issuer_node_id))

const { searchObjects, listBucketObjects, sessionEpoch } = useAruna()
const chips = ref<{ column: string; value: string }[]>([])
const hits = ref<ObjectSearchHit[] | null>(null)
const cursor = ref<string | null>(null)
const nameCursor = ref<string | null>(null)
const nameWords = ref('')
const nameFailed = ref(false)
const complete = ref(true)
const failure = ref<string | null>(null)
const busy = ref(false)
// The groups opened to their files; they stay open while more pages load.
const opened = ref(new Set<string>())
// The file counts of folders the search found only by their own entry, listed once on their node.
const counted = ref(new Map<string, string>())
let countRound = 0
let runs = 0
let unmounted = false
// The words of the last search; after a search of chips alone, new text in the box is a new query.
let searchedWords: string | null = null

// Another bucket, node or session drops every answer still on its way, and the paging.
watch(() => [props.bucket, props.nodeId, sessionEpoch.value], () => {
  runs++
  typed.value = ''
  chips.value = []
  searchedWords = null
  hits.value = null
  cursor.value = null
  nameCursor.value = null
  nameWords.value = ''
  nameFailed.value = false
  complete.value = true
  failure.value = null
  busy.value = false
  opened.value = new Set()
  counted.value = new Map()
  countRound++
})

const query = computed(() => searchQuery(searchTerms(typed.value).words, chips.value))

// Each `column=value` typed so far becomes a chip; the words stay in the box. A value whose quote
// is still open waits, so a space inside it does not cut it.
const quoteOpen = () => (typed.value.match(/"/g)?.length ?? 0) % 2 === 1
function takeChips() {
  if (quoteOpen()) return
  const terms = searchTerms(typed.value)
  if (!terms.exact.length) return
  chips.value = [...chips.value, ...terms.exact]
  typed.value = terms.words.join(' ')
}

// A search over a distributed bucket examines a bounded number of files per page, so a page may
// come back empty with a cursor; the search follows it until a hit arrives or the cursor ends.
// A newer search, another bucket or leaving the view ends it.
async function search(more = false) {
  if (unmounted) return
  if (quoteOpen()) typed.value += '"'
  if (!more && searchedWords === '' && typed.value.trim()) chips.value = []
  takeChips()
  searchSoon.cancel()
  if (query.value.trim().length < 2) return
  if (!more) searchedWords = typed.value.trim()
  const run = ++runs
  busy.value = true
  failure.value = null
  try {
    // A failed name page is asked again on Show more, not on each automatic page.
    for (let next = more, first = true; ; next = true, first = false) {
      const added = await step(next, run, first || !nameFailed.value)
      if (added === null) return
      if (added > 0 || (!cursor.value && (nameFailed.value || !nameCursor.value))) break
    }
  } catch (cause) {
    if (run === runs) failure.value = errorMessage(cause)
  } finally {
    if (run === runs) busy.value = false
  }
}
onBeforeUnmount(() => {
  unmounted = true
  runs++
  searchSoon.cancel()
})

/** One page of each search; the number of new hits, or null once a newer search took over. */
async function step(more: boolean, run: number, askNames: boolean): Promise<number | null> {
  const before = more ? (hits.value?.length ?? 0) : 0
  // Plain words also match file names; each search pages on its own cursor.
  const words = more ? nameWords.value : chips.value.length ? '' : typed.value.trim()
  const detailsCursor = more ? cursor.value : null
  const namesCursor = more ? nameCursor.value : null
  const [page, named] = await Promise.all([
    !more || detailsCursor ? searchObjects(query.value, { bucket: props.bucket, match: 'metadata', limit: 50, cursor: detailsCursor ?? undefined }) : null,
    askNames && words.length >= 2 && (!more || namesCursor !== null)
      ? searchObjects(words, { bucket: props.bucket, match: 'substring', limit: 50, cursor: namesCursor || undefined }).catch(() => 'failed' as const)
      : null,
  ])
  if (run !== runs) return null
  const names = named === 'failed' ? null : named
  if (!more) opened.value = new Set()
  const found = [...(more ? hits.value ?? [] : []), ...(names?.hits ?? []), ...(page?.hits ?? [])]
  const seen = new Set<string>()
  hits.value = found.filter((hit) => !seen.has(`${hit.issuer_node_id}/${hit.key}`) && Boolean(seen.add(`${hit.issuer_node_id}/${hit.key}`)))
  cursor.value = page?.next_cursor ?? null
  // A failed name page keeps its place ('' is the first page), so Show more asks for it again.
  if (names) nameCursor.value = names.next_cursor ?? null
  else if (named === 'failed') nameCursor.value = namesCursor ?? ''
  else if (!more) nameCursor.value = null
  nameWords.value = words
  nameFailed.value = named === null ? more && nameFailed.value : named === 'failed'
  complete.value = (!more || complete.value) && (page?.coverage.complete ?? true) && (names?.coverage.complete ?? true)
  return (hits.value?.length ?? 0) - before
}

// Opening the view is the search; Enter in the box searches again.
onMounted(() => void search())
defineExpose({ search })

// Words search while typing; a `column=value` waits for Enter or a space.
const searchSoon = useDebounceFn(() => void search(), 400)
// An edit or a removed chip ends the search under way and its paging at once.
function stop() {
  runs++
  busy.value = false
  cursor.value = null
  nameCursor.value = null
  searchSoon.cancel()
}
watch(typed, (text) => {
  stop()
  if (!text.includes('=') && !quoteOpen() && text.trim().length >= 2) void searchSoon()
}, { flush: 'sync' })

type Group = Extract<SearchRow, { kind: 'group' }>
const rows = computed(() => groupHits(hits.value ?? []))
const morePages = computed(() => Boolean(cursor.value) || nameCursor.value !== null)
// "22 files"; a page still to come makes the count a lower bound. A group of only the folder's
// own entry names no count: Open folder says what it is.
// Inside the group the files drop the folder name they repeat; the title keeps the full key.
function fileName(group: Group, file: ObjectSearchHit): string {
  const name = file.key.slice(group.folder.length + 1)
  return name.startsWith(group.folder) && '_.-'.includes(name[group.folder.length] ?? '') ? name.slice(group.folder.length) : name
}
function fileCount(group: Group): string {
  const count = groupFiles(group).length
  return count ? `${count}${morePages.value ? '+' : ''} ${count === 1 && !morePages.value ? 'file' : 'files'}` : (counted.value.get(group.key) ?? '')
}
const COUNT_LIMIT = 100
watch(rows, (list) => {
  for (const group of list) {
    if (group.kind !== 'group' || groupFiles(group).length || counted.value.has(group.key)) continue
    counted.value = new Map(counted.value).set(group.key, '')
    const round = countRound
    void listBucketObjects(props.bucket, { prefix: `${group.folder}/`, limit: COUNT_LIMIT }, group.nodeId)
      .then((page) => {
        if (round !== countRound) return
        const files = page.objects.filter((object) => !object.key.endsWith('/')).length
        const more = Boolean(page.next_cursor)
        const label = files ? `${files}${more ? '+' : ''} ${files === 1 && !more ? 'file' : 'files'}` : ''
        counted.value = new Map(counted.value).set(group.key, label)
      })
      .catch(() => undefined)
  }
})
// "4 genomes" when every group names an assembly, else folders; files found outside a group follow.
const found = computed(() => {
  const groups = rows.value.filter((row): row is Group => row.kind === 'group')
  const files = rows.value.length - groups.length
  const noun = groups.every((group) => group.metadata.assembly_accession) ? 'genome' : 'folder'
  const parts = [groups.length ? `${groups.length} ${noun}${groups.length === 1 ? '' : 's'}` : '', files ? `${files} ${files === 1 ? 'file' : 'files'}` : '']
  const text = parts.filter(Boolean).join(' and ') || 'No match'
  return morePages.value ? `At least ${text.toLowerCase()}` : text
})
// The folder opens through its own hit when the search found it, else through one made of it.
function openFolder(group: Group) {
  emit('open', group.hits.find((entry) => entry.key === `${group.folder}/`) ?? { ...group.hits[0], key: `${group.folder}/` })
}
function toggle(group: Group) {
  const next = new Set(opened.value)
  if (!next.delete(group.key)) next.add(group.key)
  opened.value = next
}

function drop(index: number) {
  chips.value = chips.value.filter((_, at) => at !== index)
  const searched = hits.value !== null || busy.value
  stop()
  if (searched) void search()
}
</script>

<template>
  <section aria-label="Whole bucket search">
    <div class="flex flex-wrap items-center justify-between gap-2 px-4 pb-2.5 @max-[600px]:px-3">
      <p class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Search class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span v-if="hits"><b class="font-medium text-foreground">{{ found }}</b> in the whole bucket</span>
        <span v-else>The whole bucket</span>
        <span v-for="(chip, index) in chips" :key="`${chip.column}=${chip.value}`" class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
          {{ chip.column }} = {{ chip.value }}
          <button type="button" :aria-label="`Remove ${chip.column}`" @click="drop(index)"><X class="h-3 w-3" /></button>
        </span>
      </p>
      <Button size="sm" variant="outline" @click="emit('back')"><ArrowLeft class="h-4 w-4" /> Back to folder</Button>
    </div>
    <p v-if="failure" class="px-4 pb-2 text-xs text-destructive">{{ failure }}</p>
    <div v-if="hits?.length" class="overflow-x-auto border-t border-border-subtle">
      <table class="data-table">
        <tbody>
          <template v-for="row in rows" :key="row.key">
            <tr v-if="row.kind === 'hit'" class="cursor-pointer" tabindex="0" @click="emit('open', row.hit)" @keydown.enter.self="emit('open', row.hit)">
              <td class="w-10 pl-4"><ObjectIcon :name="row.hit.key" :folder="row.hit.key.endsWith('/')" class="h-4 w-4" /></td>
              <td class="max-w-0 py-2">
                <span class="block truncate text-foreground" :title="row.hit.key">{{ row.hit.key.replace(/\/$/, '').split('/').at(-1) }}</span>
                <span class="block truncate text-xs text-muted-foreground">{{ row.hit.bucket }}/{{ row.hit.key.split('/').slice(0, -1).join('/') }}<template v-if="elsewhere(row.hit)">, on {{ displayName(row.hit.issuer_node_id) }}</template></span>
              </td>
              <td class="num w-28 pr-4 text-muted-foreground">{{ row.hit.size != null ? formatBytes(row.hit.size) : '' }}</td>
            </tr>
            <template v-else>
              <tr class="cursor-pointer" @click="toggle(row)">
                <td class="w-10 pl-4 text-muted-foreground">
                  <button
                    type="button"
                    class="rounded p-0.5 hover:bg-accent hover:text-foreground"
                    :aria-expanded="opened.has(row.key)"
                    :aria-label="`${opened.has(row.key) ? 'Hide' : 'Show'} the files of ${groupTitle(row)}`"
                    @click.stop="toggle(row)"
                  >
                    <ChevronRight class="h-4 w-4 transition-transform" :class="opened.has(row.key) ? 'rotate-90' : ''" aria-hidden="true" />
                  </button>
                </td>
                <td class="max-w-0 py-2">
                  <span class="flex items-start gap-2">
                    <Dna class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span class="min-w-0">
                      <span class="block break-words font-medium text-foreground">{{ groupTitle(row) }}</span>
                      <span class="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span v-if="row.metadata.assembly_accession" class="inline-flex items-center gap-1"><Hash class="h-3 w-3" aria-hidden="true" />{{ row.metadata.assembly_accession }}</span>
                        <span v-if="row.metadata.assembly_level">{{ row.metadata.assembly_level }}</span>
                        <span v-if="fileCount(row)" class="tabular-nums">{{ fileCount(row) }}</span>
                        <span v-if="elsewhere(row.hits[0])">on {{ displayName(row.nodeId) }}</span>
                      </span>
                    </span>
                  </span>
                </td>
                <td class="w-28 pr-4 text-right">
                  <Button size="sm" variant="outline" :aria-label="`Open ${row.folder}/`" :title="`Open ${row.folder}/`" @click.stop="openFolder(row)">
                    <FolderOpen class="h-4 w-4" /><span class="@max-[600px]:sr-only">Open folder</span>
                  </Button>
                </td>
              </tr>
              <template v-if="opened.has(row.key)">
                <tr v-for="file in groupFiles(row).slice(0, 4)" :key="file.key" class="cursor-pointer bg-muted/20" tabindex="0" @click="emit('open', file)" @keydown.enter.self="emit('open', file)">
                  <td></td>
                  <td class="max-w-0">
                    <span class="flex min-w-0 items-center gap-2 pl-6" :title="file.key">
                      <ObjectIcon :name="file.key" class="h-4 w-4" />
                      <span class="truncate text-foreground">{{ fileName(row, file) }}</span>
                    </span>
                  </td>
                  <td class="num w-28 pr-4 text-xs text-muted-foreground">{{ file.size != null ? formatBytes(file.size) : '' }}</td>
                </tr>
                <tr v-if="groupFiles(row).length > 4" class="bg-muted/20">
                  <td></td>
                  <td colspan="2" class="pl-12">
                    <Button size="sm" variant="outline" @click="openFolder(row)">Show all {{ fileCount(row) }}</Button>
                  </td>
                </tr>
              </template>
            </template>
          </template>
        </tbody>
      </table>
    </div>
    <div class="space-y-1 px-4 pb-3 empty:hidden">
      <p v-if="hits && !hits.length && !busy && complete && !nameFailed" class="py-6 text-center text-xs text-muted-foreground">Nothing matches.</p>
      <p v-if="hits && !complete" class="text-xs text-muted-foreground">Some parts of this bucket could not be searched, so matches may be missing.</p>
      <p v-if="hits && nameFailed" class="text-xs text-muted-foreground">The name search failed, so matches by name may be missing.</p>
      <p v-if="busy" role="status" class="text-xs text-muted-foreground">Searching…</p>
      <Button v-if="cursor || nameCursor !== null" size="sm" variant="outline" :disabled="busy" @click="search(true)">Show more</Button>
    </div>
  </section>
</template>
