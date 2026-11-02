<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import ScrollArea from '@/components/ui/ScrollArea.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import DetailList, { type Detail } from '@/components/ui/DetailList.vue'
import EntityFieldList from '@/components/metadata/EntityFieldList.vue'
import ListPager from '@/components/ui/ListPager.vue'
import { ArrowLeft, Check, Copy, File as FileIcon, Folder, Info, Search } from '@lucide/vue'
import { useCrateReferences } from '@/composables/useCrateReferences'
import { usePagedList } from '@/composables/usePagedList'
import { useS3 } from '@/composables/useS3'
import { referencesTo } from '@/lib/datasetAbout'
import { objectLocation, objectRoute, parseDataIdentity } from '@/lib/crate/dataIdentity'
import { presentDataEntity } from '@/lib/cratePresenter'
import { formatContentSize } from '@/lib/dataEntities'
import { termNameFromUri } from '@/lib/profiles/uri'
import { copyToClipboard, isHttpUrl } from '@/lib/utils'
import type { MetadataProfile } from '@/data/types'

// Full metadata of one entity (a file, sub-dataset, person, run or any other), opened from a row,
// a name or a reference. A data entity adds where its bytes are and Open in Data. Stacks above whatever dialog hosts it: the later
// mounted radix portal paints on top and owns Escape and focus. In-dialog
// references drill down on an internal stack instead of nesting more dialogs;
// ids outside the graph bubble up as a jump so the page can take over.
const props = defineProps<{
  open: boolean
  crate: unknown
  entityId: string
  profile?: MetadataProfile | null
  /** The dataset this crate belongs to, left out of the other datasets that reference a file. */
  documentId?: string
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'jump', id: string): void
}>()

const stack = ref<string[]>([])
const currentId = computed(() => stack.value.at(-1) ?? props.entityId)
watch(
  () => [props.open, props.entityId],
  () => {
    stack.value = []
  },
)

const entity = computed(() =>
  props.open ? presentDataEntity(props.crate, currentId.value, { profile: props.profile?.entityRules ?? [] }) : null,
)

function drill(id: string) {
  if (presentDataEntity(props.crate, id)) {
    stack.value = [...stack.value, id]
    return
  }
  // Not a graph entity (an absolute URL already rendered as a link never gets
  // here); hand the id to the host page and close.
  emit('jump', id)
  emit('update:open', false)
}

function back() {
  stack.value = stack.value.slice(0, -1)
}

// The type chip row shows compact names; an ontology-URI type keeps its full
// IRI as a link so `https://w3id.org/mixs/0010011` stays resolvable.
const typeChips = computed(() =>
  (entity.value?.typeUris ?? []).map((uri) => ({
    uri,
    label: termNameFromUri(uri),
    href: isHttpUrl(uri) ? uri : undefined,
  })),
)

const s3 = useS3()
const identity = computed(() => (entity.value ? parseDataIdentity(entity.value, s3.endpoint.value) : null))

// Only a file or a folder has a size, format and location; a person or a run has none.
const isData = computed(() => {
  const current = entity.value
  if (!current) return false
  return Boolean(current.contentUrl || current.contentSize || current.encodingFormat)
    || current.types.some((type) => type === 'File' || type === 'Dataset' || type === 'MediaObject')
})

// The content address and the S3 path stand apart; any other contentUrl stays a plain location.
const details = computed<Detail[]>(() => {
  const found = identity.value
  if (!entity.value || !found || !isData.value) return []
  return [
    { key: 'size', label: 'Size', value: formatContentSize(entity.value.contentSize) },
    { key: 'format', label: 'Format', value: entity.value.encodingFormat || '-' },
    ...(found.contentId ? [{ key: 'content', label: 'Content address', value: found.contentId, mono: true }] : []),
    found.s3
      ? { key: 's3', label: 'S3 path', value: objectLocation(found.s3.bucket, found.s3.key), mono: true }
      : { key: 'location', label: 'Location', value: entity.value.contentUrl || '-' },
    ...(found.global ? [{ key: 'version', label: 'Version', value: found.global.versionId, mono: true }] : []),
  ]
})

// Who points at this entity: the crate's own entities, then other loaded datasets that list the file.
const { referencesFor } = useCrateReferences()
const references = computed(() => {
  if (!entity.value) return []
  const inside = referencesTo(props.crate, currentId.value).map((ref) => ({ ...ref, key: `${ref.id}|${ref.property}`, dataset: '' }))
  const seen = new Set<string>()
  const outside = [currentId.value, entity.value.contentUrl ?? '']
    .filter(Boolean)
    .flatMap((url) => referencesFor(url))
    .filter((ref) => ref.documentId !== props.documentId && !seen.has(ref.documentId) && seen.add(ref.documentId))
    .map((ref) => ({ id: ref.documentId, name: ref.title, property: 'Other dataset', key: `doc|${ref.documentId}`, dataset: ref.documentId }))
  return [...inside, ...outside]
})
const { page, pageSize, shown, total, paged } = usePagedList(references)

const copied = ref(false)
let copyTimer: number | undefined
async function copyId() {
  await copyToClipboard(currentId.value)
  copied.value = true
  window.clearTimeout(copyTimer)
  copyTimer = window.setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-h-[calc(100vh-2rem)] max-w-xl overflow-hidden">
      <DialogHeader>
        <DialogTitle class="flex min-w-0 items-center gap-2 pr-10">
          <Info class="h-4 w-4 shrink-0 text-primary" />
          <span class="min-w-0 truncate">{{ entity?.name ?? 'Entity' }}</span>
          <RouterLink
            v-if="entity"
            :to="{ name: 'datasets', query: { q: entity.name } }"
            class="ml-auto inline-flex shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Search datasets with this"
            title="Search datasets with this"
            @click="emit('update:open', false)"
          ><Search class="size-4" /></RouterLink>
        </DialogTitle>
        <DialogDescription class="sr-only">All stored metadata of this entity.</DialogDescription>
      </DialogHeader>

      <div v-if="entity" class="space-y-3">
        <div class="flex min-w-0 items-center gap-1.5">
          <button
            v-if="stack.length"
            type="button"
            class="chip shrink-0 text-primary hover:border-primary/40"
            @click="back"
          ><ArrowLeft class="h-3 w-3" /> Back</button>
          <span class="min-w-0 truncate font-mono text-[11px] text-muted-foreground" :title="currentId">{{ currentId }}</span>
          <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" :aria-label="copied ? 'Copied' : 'Copy id'" @click="copyId">
            <Check v-if="copied" class="size-3.5 text-primary" />
            <Copy v-else class="size-3.5" />
          </Button>
        </div>

        <div class="flex flex-wrap gap-1.5">
          <template v-for="chip in typeChips" :key="chip.uri">
            <ExternalLink v-if="chip.href" :href="chip.href" :label="chip.label" class="chip text-primary" :title="chip.uri" />
            <Badge v-else variant="outline" size="sm">{{ chip.label }}</Badge>
          </template>
          <Badge v-if="entity.profileLabel" variant="outline" size="sm">{{ entity.profileLabel }}</Badge>
        </div>

        <DetailList :items="details">
          <template #s3="{ item }">
            <RouterLink
              v-if="identity?.s3"
              :to="objectRoute(identity.s3.bucket, identity.s3.key)"
              class="text-primary hover:underline"
              title="Open in the bucket browser"
              @click="emit('update:open', false)"
            >{{ item.value }}</RouterLink>
          </template>
          <template #location>
            <ExternalLink v-if="entity.contentUrl" :href="entity.contentUrl" :label="entity.contentUrl" :title="entity.contentUrl" />
            <span v-else>-</span>
          </template>
        </DetailList>

        <div v-if="entity.children.length" class="space-y-1">
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Contents</h3>
          <ul class="divide-y divide-border/50 rounded-md border border-border/60">
            <li v-for="child in entity.children" :key="child.id">
              <button
                type="button"
                class="flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left text-sm text-primary hover:bg-muted/40"
                :title="child.id"
                @click="drill(child.id)"
              >
                <Folder v-if="child.directory" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <FileIcon v-else class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span class="truncate">{{ child.name }}</span>
              </button>
            </li>
          </ul>
        </div>

        <ScrollArea class="max-h-[45vh] pr-1">
          <EntityFieldList v-if="entity.fields.length" :fields="entity.fields" @jump="drill" />
          <p v-else class="py-2 text-xs text-muted-foreground">This entity carries no further metadata.</p>

          <div v-if="references.length" class="mt-4 space-y-1">
            <h3 class="text-sm font-medium">Referenced by <span class="font-normal tabular-nums text-muted-foreground">{{ references.length }}</span></h3>
            <table class="w-full text-sm">
              <thead class="border-b border-border text-xs text-muted-foreground">
                <tr><th class="py-1.5 pr-3 text-left font-medium">Name</th><th class="py-1.5 text-left font-medium">Through</th></tr>
              </thead>
              <tbody>
                <tr v-for="ref in shown" :key="ref.key" class="border-b border-border-subtle last:border-0">
                  <td class="max-w-0 py-1.5 pr-3">
                    <RouterLink v-if="ref.dataset" :to="{ name: 'dataset', params: { id: ref.dataset } }" class="block truncate underline decoration-border underline-offset-4 hover:decoration-foreground" @click="emit('update:open', false)">{{ ref.name }}</RouterLink>
                    <button v-else type="button" class="max-w-full truncate text-left underline decoration-border underline-offset-4 hover:decoration-foreground" :title="ref.id" @click="drill(ref.id)">{{ ref.name }}</button>
                  </td>
                  <td class="py-1.5 text-muted-foreground">{{ ref.property }}</td>
                </tr>
              </tbody>
            </table>
            <ListPager v-if="paged" v-model:page="page" v-model:page-size="pageSize" :total="total" />
            <p v-if="references.some((ref) => ref.dataset)" class="text-xs text-muted-foreground">Loaded datasets only: other datasets come from the pages already read.</p>
          </div>
        </ScrollArea>
      </div>
      <p v-else class="py-6 text-sm text-muted-foreground">This entity is not part of the loaded dataset.</p>

      <DialogFooter>
        <Button v-if="identity?.s3" variant="outline" size="sm" as-child>
          <RouterLink :to="objectRoute(identity.s3.bucket, identity.s3.key)" @click="emit('update:open', false)">Open in Data</RouterLink>
        </Button>
        <DialogClose as-child><Button variant="outline" size="sm">Close</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
