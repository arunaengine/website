<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
import FactList, { type Fact } from '@/components/ui/FactList.vue'
import EntityFieldList from '@/components/metadata/EntityFieldList.vue'
import { ArrowLeft, Check, Copy, File as FileIcon, Folder, Info } from '@lucide/vue'
import { presentDataEntity } from '@/lib/cratePresenter'
import { formatContentSize } from '@/lib/dataEntities'
import { termNameFromUri } from '@/lib/profiles/uri'
import { copyToClipboard, isHttpUrl } from '@/lib/utils'
import type { MetadataProfile } from '@/data/types'

// Full metadata of one data entity (file or sub-dataset), opened from an info
// icon next to a file row. Stacks above whatever dialog hosts it: the later
// mounted radix portal paints on top and owns Escape and focus. In-dialog
// references drill down on an internal stack instead of nesting more dialogs;
// ids outside the graph bubble up as a jump so the page can take over.
const props = defineProps<{
  open: boolean
  crate: unknown
  entityId: string
  profile?: MetadataProfile | null
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

const facts = computed<Fact[]>(() =>
  entity.value
    ? [
        { key: 'size', label: 'Size', value: formatContentSize(entity.value.contentSize) },
        { key: 'format', label: 'Format', value: entity.value.encodingFormat || '-' },
        { key: 'location', label: 'Location', value: entity.value.contentUrl || '-' },
      ]
    : [],
)

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
        <DialogTitle class="flex min-w-0 items-center gap-2">
          <Info class="h-4 w-4 shrink-0 text-primary" />
          <span class="truncate">{{ entity?.name ?? 'File metadata' }}</span>
        </DialogTitle>
        <DialogDescription class="sr-only">All stored metadata of this data entity.</DialogDescription>
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
            <Badge v-else variant="outline" size="sm" class="uppercase">{{ chip.label }}</Badge>
          </template>
          <Badge v-if="entity.profileLabel" variant="outline" size="sm">{{ entity.profileLabel }}</Badge>
        </div>

        <FactList :items="facts">
          <template #location>
            <ExternalLink v-if="entity.contentUrl" :href="entity.contentUrl" :label="entity.contentUrl" :title="entity.contentUrl" />
            <span v-else>-</span>
          </template>
        </FactList>

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
        </ScrollArea>
      </div>
      <p v-else class="py-6 text-sm text-muted-foreground">This entity is not part of the loaded crate.</p>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline" size="sm">Close</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
