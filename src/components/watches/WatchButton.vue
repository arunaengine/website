<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogTrigger from '@/components/ui/DialogTrigger.vue'
import { Eye, EyeOff } from '@lucide/vue'
import { useWatches } from '@/composables/useWatches'
import { WATCH_EVENT_KINDS, type WatchEventKind } from '@/lib/watches'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'

// "Watch this" affordance for one canonical resource prefix. The event kind is
// bound to the prefix namespace (s3/… ⇒ data_uploaded, meta/… ⇒
// metadata_created); the other kind renders disabled so the constraint is
// visible rather than silent.
const props = defineProps<{
  pathPrefix: string
  eventKind: WatchEventKind
  resourceLabel: string
  size?: 'sm' | 'default'
}>()

const { available, creating, deletingIds, ensureLoaded, createWatch, deleteWatch, findWatch } =
  useWatches()
const { writesDisabled } = useConnectivity()

const open = ref(false)
const dialogError = ref<string | null>(null)
const selected = ref<WatchEventKind[]>([props.eventKind])

const existing = computed(() => findWatch(props.pathPrefix, props.eventKind))
const watching = computed(() => Boolean(existing.value))
const busy = computed(
  () => creating.value || Boolean(existing.value && deletingIds.value.includes(existing.value.id)),
)

onMounted(() => void ensureLoaded())
watch(
  () => props.eventKind,
  (kind) => {
    selected.value = [kind]
  },
)

function onOpenChange(value: boolean) {
  open.value = value
  if (value) {
    dialogError.value = null
    selected.value = [props.eventKind]
  }
}

async function onCreate() {
  if (!selected.value.length) return
  dialogError.value = null
  try {
    await createWatch(props.pathPrefix, selected.value)
    open.value = false
  } catch (err) {
    dialogError.value = err instanceof Error ? err.message : String(err)
  }
}

async function onDelete() {
  const id = existing.value?.id
  if (!id) return
  dialogError.value = null
  try {
    await deleteWatch(id)
    open.value = false
  } catch (err) {
    dialogError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <Dialog v-if="available" :open="open" @update:open="onOpenChange">
    <DialogTrigger as-child>
      <Button
        variant="outline"
        :size="size ?? 'default'"
        :aria-pressed="watching"
        :title="watching ? 'You are watching this resource' : 'Get notified about changes here'"
      >
        <component :is="watching ? EyeOff : Eye" class="h-4 w-4" :class="watching ? 'text-primary' : ''" />
        {{ watching ? 'Watching' : 'Watch' }}
      </Button>
    </DialogTrigger>
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>{{ watching ? 'Watching this resource' : 'Watch this resource' }}</DialogTitle>
        <DialogDescription>
          {{
            watching
              ? 'Matching events are delivered to your notifications. You can stop watching at any time.'
              : 'Get a notification whenever a matching event happens under this path.'
          }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-3">
        <div class="surface-muted px-3 py-2">
          <div class="text-[11px] uppercase tracking-wider text-muted-foreground">Watched prefix</div>
          <div class="mt-1 break-all font-mono text-xs text-foreground">{{ pathPrefix }}</div>
        </div>

        <fieldset v-if="!watching">
          <legend class="text-xs font-medium text-foreground">Events</legend>
          <div class="mt-2 space-y-2">
            <label
              v-for="info in WATCH_EVENT_KINDS"
              :key="info.kind"
              class="flex items-start gap-2 text-sm"
              :class="info.kind !== eventKind ? 'opacity-50' : ''"
            >
              <input
                v-model="selected"
                type="checkbox"
                :value="info.kind"
                :disabled="info.kind !== eventKind"
                class="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
              />
              <span>
                <span class="font-medium text-foreground">{{ info.label }}</span>
                <span class="block text-xs text-muted-foreground">{{ info.description }}</span>
              </span>
            </label>
          </div>
          <p class="mt-2 text-xs text-muted-foreground">
            Data and metadata events use separate watch namespaces, so only the kind matching this
            resource can be selected.
          </p>
        </fieldset>

        <p v-else class="text-sm text-muted-foreground">
          Watching <span class="font-medium text-foreground">{{ resourceLabel }}</span> for
          {{ existing?.events.join(', ').replace(/_/g, ' ') }} events.
        </p>

        <p v-if="dialogError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {{ dialogError }}
        </p>
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button
          v-if="watching"
          variant="destructive"
          :disabled="busy || writesDisabled"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          @click="onDelete"
        >
          {{ busy ? 'Removing…' : 'Stop watching' }}
        </Button>
        <Button
          v-else
          :disabled="busy || !selected.length || writesDisabled"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          @click="onCreate"
        >
          {{ busy ? 'Creating…' : 'Watch' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
