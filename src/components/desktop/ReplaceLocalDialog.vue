<script setup lang="ts">
// Replacing bytes on the owner's disk is the one thing the sync never does by
// itself, so it happens here: both copies are laid out side by side, and the
// folder-wide form has to be confirmed by typing the folder's name.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { folderName, isStaleExpectation, type FolderEntry, type SyncedFolder } from '@/lib/deviceApi'
import { formatBytes, relativeTime, truncateMiddle } from '@/lib/utils'
import { Loader2 } from '@lucide/vue'

// `entry` absent means the folder-wide form: every entry still waiting.
const props = defineProps<{ open: boolean; folder: SyncedFolder; entry?: FolderEntry | null }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void; (e: 'replaced'): void }>()

const { entryAction, folderReplace, busy } = useSyncedFolders()

const confirmText = ref('')
const error = ref<string | null>(null)

const entry = computed(() => props.entry ?? null)
const name = computed(() => folderName(props.folder.root))
const pendingCount = computed(
  () => props.folder.counters.conflicts + props.folder.counters.pending_replacements,
)

watch(
  () => props.open,
  (open) => {
    if (open) {
      confirmText.value = ''
      error.value = null
    }
  },
)

function when(ms: number | null): string {
  return ms ? relativeTime(new Date(ms).toISOString()) : 'unknown'
}

function bytes(value: number | null): string {
  return value === null ? 'unknown' : formatBytes(value)
}

function hash(value: string | null): string {
  return value ? truncateMiddle(value, 8, 6) : 'not hashed'
}

const localFacts = computed(() => [
  { label: 'Size', value: bytes(entry.value?.local?.size ?? null) },
  { label: 'Changed', value: when(entry.value?.local?.modified_at_ms ?? null) },
  { label: 'blake3', value: hash(entry.value?.local?.blake3 ?? null) },
])
const remoteFacts = computed(() => [
  { label: 'Size', value: bytes(entry.value?.remote?.size ?? null) },
  { label: 'Changed', value: when(entry.value?.remote?.modified_at_ms ?? null) },
  { label: 'blake3', value: hash(entry.value?.remote?.blake3 ?? null) },
])

// The folder form is armed only by the folder's own name, typed exactly.
const confirmed = computed(() => (entry.value ? true : confirmText.value === name.value))
const canReplace = computed(() => confirmed.value && !busy.value)

async function replace(): Promise<void> {
  if (!canReplace.value) return
  error.value = null
  try {
    const target = entry.value
    if (target) {
      await entryAction(props.folder.folder_id, target.path, 'replace_local', {
        blake3: target.local?.blake3 ?? undefined,
        remote_version: target.remote?.version_id ?? undefined,
      })
    } else {
      await folderReplace(props.folder.folder_id, confirmText.value)
    }
    emit('replaced')
    emit('update:open', false)
  } catch (err) {
    error.value = isStaleExpectation(err)
      ? 'The file changed again since this screen was drawn, so nothing was replaced. Reload the folder and look at it once more.'
      : err instanceof Error
        ? err.message
        : String(err)
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>
          {{ entry ? 'Replace your copy' : `Replace ${pendingCount} local files` }}
        </DialogTitle>
        <DialogDescription>
          <template v-if="entry">
            The file at <code class="font-mono text-[11px]">{{ entry.path }}</code> is overwritten with the realm
            version. Your current bytes are gone afterwards.
          </template>
          <template v-else>
            Every file in <span class="font-medium text-foreground">{{ name }}</span> that is waiting for a decision is
            overwritten with the realm version. Their current bytes are gone afterwards.
          </template>
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-1">
        <div v-if="entry" class="grid gap-3 sm:grid-cols-2">
          <section class="rounded-md border border-primary/30 bg-primary/[0.06] px-3 py-2.5">
            <h3 class="text-[11px] font-semibold uppercase tracking-wider text-foreground">On this computer</h3>
            <dl class="mt-2 space-y-1">
              <div v-for="fact in localFacts" :key="fact.label" class="flex items-baseline justify-between gap-3">
                <dt class="text-[11px] text-muted-foreground">{{ fact.label }}</dt>
                <dd class="truncate font-mono text-[11px] text-foreground">{{ fact.value }}</dd>
              </div>
            </dl>
          </section>
          <section class="rounded-md border border-border px-3 py-2.5">
            <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">In the realm</h3>
            <dl class="mt-2 space-y-1">
              <div v-for="fact in remoteFacts" :key="fact.label" class="flex items-baseline justify-between gap-3">
                <dt class="text-[11px] text-muted-foreground">{{ fact.label }}</dt>
                <dd class="truncate font-mono text-[11px] text-foreground">{{ fact.value }}</dd>
              </div>
            </dl>
          </section>
        </div>

        <p
          v-if="entry?.conflicted_copy"
          class="rounded-md bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
        >
          The realm version is already on this disk as
          <code class="font-mono">{{ entry.conflicted_copy }}</code
          >. Replacing puts it in place of your file.
        </p>

        <div v-if="!entry" class="space-y-2">
          <label class="block">
            <span class="text-xs font-medium text-foreground">Type <span class="font-mono">{{ name }}</span> to confirm</span>
            <Input
              v-model="confirmText"
              class="mt-1 max-w-xs font-mono text-xs"
              :placeholder="name"
              aria-label="Folder name confirmation"
            />
          </label>
          <p class="text-[11px] text-muted-foreground">
            Files that are already in sync are untouched. Only the ones waiting for you are replaced.
          </p>
        </div>

        <p
          v-if="error"
          class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {{ error }}
        </p>
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="ghost">Keep my copy</Button></DialogClose>
        <Button variant="destructive" :disabled="!canReplace" @click="replace">
          <Loader2 v-if="busy" class="h-4 w-4 animate-spin" />
          {{ entry ? 'Replace my copy' : 'Replace them' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
