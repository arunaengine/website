<script setup lang="ts">
// New bucket in Aruna Desktop: a name, a group and the place that stores it.
// A realm node is the default. A bucket on this computer stays here and cannot
// be linked to a folder. A bucket that is linked next is made by that link.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes, type RealmNodeDisplay } from '@/composables/useRealmNodes'
import { isS3NetworkError, s3ErrorMessage, useS3 } from '@/composables/useS3'
import { apiRequest, type InfoResponse } from '@/lib/api'
import type { BindSource } from '@/lib/bindSource'
import { bucketNameProblem } from '@/lib/bucketName'
import { defaultPlace, freeSpace, placeName, placeTitle } from '@/lib/bucketPlace'
import { desktopContext } from '@/lib/desktop'
import { formatBytes } from '@/lib/utils'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { Boxes, Laptop, Plus, Server } from '@lucide/vue'

// forLink: opened from Link a local folder, which links the bucket next.
const props = defineProps<{ open: boolean; name?: string; groupId?: string | null; forLink?: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', bucket: BindSource): void
  (e: 'link', bucket: BindSource): void
}>()

const { apiBaseUrl, myGroups } = useAruna()
const realmNodes = useRealmNodes()
const s3 = useS3()

const NODE_REFUSED =
  'This node does not let the app create buckets directly. Turn on "Then link a folder" to create it with the link.'

const name = ref('')
const groupId = ref('')
const nodeId = ref('')
const link = ref(true)
const suggested = ref<string | null>(null)
const error = ref<string | null>(null)
const creating = ref(false)
// Space left per node; a missing entry is still being read.
const free = ref(new Map<string, number | null>())

// Realm nodes first, then this computer; other devices hold no new buckets.
const places = computed(() =>
  realmNodes.nodes.value
    .filter((node) => node.kind !== 'user' || node.isLocal)
    .sort((a, b) => Number(a.kind === 'user') - Number(b.kind === 'user')),
)
const groupOptions = computed(() => myGroups.value.map((group) => ({ value: group.id, label: group.name })))
const place = computed(() => places.value.find((entry) => entry.nodeId === nodeId.value) ?? null)
const here = computed(() => place.value?.kind === 'user')
const deferred = computed(() => !here.value && (props.forLink || link.value))
const groupName = computed(() => myGroups.value.find((group) => group.id === groupId.value)?.name ?? groupId.value)
const trimmed = computed(() => name.value.trim())
const nameProblem = computed(() => {
  if (!trimmed.value) return null
  if (deferred.value && isWorkspaceBucket(trimmed.value)) return 'Workspace buckets (ws-…) cannot be linked to a folder.'
  return bucketNameProblem(trimmed.value)
})
const canCreate = computed(
  () => Boolean(trimmed.value && groupId.value && place.value) && !nameProblem.value && !creating.value && !blocked(place.value),
)

function blocked(entry: RealmNodeDisplay | null): boolean {
  return Boolean(props.forLink && entry?.kind === 'user')
}

function deviceName(entry: RealmNodeDisplay): string {
  return entry.info?.labels?.name || entry.info?.labels?.display_name || 'Not set'
}

function freeLabel(id: string): string {
  if (!free.value.has(id)) return 'Checking'
  const bytes = free.value.get(id)
  return bytes == null ? 'Not reported' : `${formatBytes(bytes)} free`
}

function note(entry: RealmNodeDisplay): string {
  if (entry.kind === 'user') return 'Stays here. No folder link.'
  return entry.reachable ? '' : 'Not reachable now'
}

function choose(entry: RealmNodeDisplay) {
  if (!blocked(entry)) nodeId.value = entry.nodeId
}

let freeRun = 0
async function loadFree() {
  const run = ++freeRun
  free.value = new Map()
  await Promise.all(
    places.value.map(async (entry) => {
      const base = entry.isLocal ? apiBaseUrl.value : entry.apiBase
      const info = base
        ? await apiRequest<InfoResponse>('/system/info', {}, { baseUrl: base }).catch(() => null)
        : null
      if (run === freeRun) free.value = new Map(free.value).set(entry.nodeId, freeSpace(info))
    }),
  )
}

function suggest() {
  suggested.value = defaultPlace(places.value, desktopContext()?.realmUrl)
  nodeId.value = suggested.value ?? ''
  void loadFree()
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    name.value = props.name ?? ''
    groupId.value = props.groupId || groupOptions.value[0]?.value || ''
    link.value = true
    error.value = null
    suggest()
  },
  { immediate: true },
)
// The realm's nodes may arrive after the dialog opened.
watch(places, () => {
  if (props.open && !nodeId.value) suggest()
})

async function submit() {
  if (!canCreate.value || !place.value) return
  const target: BindSource = { bucket: trimmed.value, nodeId: place.value.nodeId, groupId: groupId.value }
  if (deferred.value) {
    emit('link', target)
    emit('update:open', false)
    return
  }
  creating.value = true
  error.value = null
  try {
    const session = await s3.activateContext(target.nodeId, target.groupId)
    const reference = { nodeId: session.issuerNodeId, groupId: target.groupId, accessKeyId: session.accessKeyId }
    await s3.createBucket(target.bucket, session.issuerNodeId, reference)
    emit('created', target)
    emit('update:open', false)
  } catch (err) {
    error.value = !here.value && isS3NetworkError(err) ? NODE_REFUSED : s3ErrorMessage(err, target.bucket)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle>New bucket</DialogTitle>
        <DialogDescription>Name it and choose where it is stored.</DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-1">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="text-xs font-medium text-foreground">Name</span>
            <Input
              v-model="name"
              class="mt-1 font-mono text-xs"
              placeholder="bucket-name"
              aria-label="Bucket name"
              :invalid="nameProblem ? 'error' : undefined"
              @keyup.enter="submit"
            />
            <span v-if="nameProblem" class="mt-1 block text-[11px] text-destructive">{{ nameProblem }}</span>
          </label>
          <label class="block">
            <span class="text-xs font-medium text-foreground">Group</span>
            <GroupSelect
              v-model="groupId"
              class="mt-1"
              :options="groupOptions"
              placeholder="Pick a group"
              aria-label="Group that owns the bucket"
              @navigate="emit('update:open', false)"
            />
          </label>
        </div>

        <div>
          <span class="text-xs font-medium text-foreground">Where is it stored?</span>
          <div class="mt-2 overflow-x-auto rounded-md border border-border">
            <table class="w-full text-left text-xs">
              <thead class="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <th class="w-8 px-3 py-2"><span class="sr-only">Choose</span></th>
                  <th class="px-3 py-2 font-medium">Place</th>
                  <th class="px-3 py-2 font-medium">Location</th>
                  <th class="px-3 py-2 font-medium">Free space</th>
                  <th class="px-3 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="entry in places"
                  :key="entry.nodeId"
                  class="border-b border-border/70 last:border-0"
                  :class="[
                    entry.nodeId === nodeId ? 'bg-primary/5' : '',
                    blocked(entry) ? 'opacity-60' : 'cursor-pointer hover:bg-muted/50',
                  ]"
                  @click="choose(entry)"
                >
                  <td class="px-3 py-2">
                    <input
                      type="radio"
                      name="bucket-place"
                      class="accent-primary"
                      :aria-label="placeName(entry)"
                      :checked="entry.nodeId === nodeId"
                      :disabled="blocked(entry)"
                      @change="choose(entry)"
                    />
                  </td>
                  <td class="px-3 py-2" :title="placeTitle(entry)">
                    <span class="flex items-center gap-2 text-foreground">
                      <component :is="entry.kind === 'user' ? Laptop : Server" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {{ entry.kind === 'user' ? 'This computer' : entry.label }}
                      <Badge v-if="entry.nodeId === suggested" variant="outline" size="sm">default</Badge>
                    </span>
                  </td>
                  <td class="px-3 py-2 text-muted-foreground">
                    {{ entry.kind === 'user' ? deviceName(entry) : (entry.location ?? 'Not set') }}
                  </td>
                  <td class="px-3 py-2 text-muted-foreground">{{ freeLabel(entry.nodeId) }}</td>
                  <td class="px-3 py-2 text-muted-foreground">{{ note(entry) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="!places.length" class="mt-1 text-[11px] text-muted-foreground">No realm node is known yet.</p>
        </div>

        <label v-if="!props.forLink" class="flex items-start gap-2" :class="here ? 'opacity-60' : ''">
          <input
            type="checkbox"
            class="mt-0.5 h-4 w-4 accent-primary"
            aria-label="Then link a folder on this computer"
            :checked="link && !here"
            :disabled="here"
            @change="link = ($event.target as HTMLInputElement).checked"
          />
          <span>
            <span class="block text-sm text-foreground">Then link a folder on this computer</span>
            <span class="block text-[11px] text-muted-foreground">Opens Link a local folder with this bucket filled in.</span>
          </span>
        </label>

        <p
          v-if="trimmed && place && !nameProblem"
          class="surface-muted flex flex-wrap items-center gap-1.5 px-3 py-2 text-xs"
          data-testid="new-bucket-summary"
        >
          <Boxes class="h-3.5 w-3.5 shrink-0 text-primary" />
          Creates <code class="font-mono">{{ trimmed }}</code> on {{ placeName(place) }} for
          {{ groupName }}{{ deferred ? ' when the folder is linked.' : '.' }}
        </p>

        <RefusalNote v-if="error" :message="error" />
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="ghost">Cancel</Button></DialogClose>
        <Button :disabled="!canCreate" @click="submit">
          <Spinner v-if="creating" label="Creating the bucket…" />
          <Plus v-else class="h-4 w-4" />
          {{ deferred ? 'Continue' : 'Create bucket' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
