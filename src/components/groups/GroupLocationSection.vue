<script setup lang="ts">
// Where new datasets of a group store their files. Group admins can change it;
// members see it read only. Non-members get no location and see nothing.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { MapPin } from '@lucide/vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import Notice from '@/components/ui/Notice.vue'
import StorageLocationFields from '@/components/metadata/StorageLocationFields.vue'
import { useAruna } from '@/composables/useAruna'
import { apiErrorMessage, type GroupDetailResponse } from '@/lib/api'
import { defaultStorageBucket, folderRoute } from '@/lib/crate/dataIdentity'

// `reload` changes after the group storage or its rules changed.
const props = defineProps<{ group: GroupDetailResponse; canAdmin: boolean; reload?: number }>()
const emit = defineEmits<{ (e: 'changed', group: GroupDetailResponse): void }>()
const { setGroupLocation, getBucketRouting, getGroupRouting, listGroupBackends } = useAruna()

const open = ref(false)
const choice = ref({ bucket: '', prefix: '' })
const busy = ref(false)
const error = ref<string | null>(null)

const location = computed(() => props.group.dataset_location ?? null)
const generated = computed(() => defaultStorageBucket(props.group.group_id))
const isGenerated = computed(() => location.value?.bucket === generated.value && !location.value.prefix)

// Where the files are stored: the longest rule of the bucket that covers the
// dataset prefix, else the group default. Only the storage name is shown.
const stored = ref('')
let loadSeq = 0
watch(
  () => [props.group.group_id, location.value?.bucket, location.value?.prefix, props.reload] as const,
  async ([groupId, bucket, prefix]) => {
    const seq = ++loadSeq
    stored.value = ''
    if (!bucket) return
    try {
      const [bucketRules, group, list] = await Promise.all([
        getBucketRouting(bucket),
        getGroupRouting(groupId),
        listGroupBackends(groupId),
      ])
      if (seq !== loadSeq) return
      const covering = bucketRules.rules
        .filter((rule) => !rule.exact && (prefix ?? '').startsWith(rule.key_prefix))
        .sort((x, y) => y.key_prefix.length - x.key_prefix.length)
      const target = covering.length ? covering[0].target : group.default_target
      if (!target) stored.value = 'Files are stored on this node.'
      else if (target.backend_id) {
        const backend = list.backends.find((entry) => entry.backend_id === target.backend_id)
        if (backend) stored.value = backend.disabled ? `${backend.name} is disabled.` : `Files are stored in ${backend.name}.`
      }
    } catch {
      // Without the rules the line stays hidden.
    }
  },
  { immediate: true },
)

function edit() {
  choice.value = { ...(location.value ?? { bucket: generated.value, prefix: '' }) }
  error.value = null
  open.value = true
}

// null restores the generated group bucket.
async function save(target: { bucket: string; prefix: string } | null) {
  const groupId = props.group.group_id
  busy.value = true
  error.value = null
  try {
    const updated = await setGroupLocation(groupId, target)
    if (groupId !== props.group.group_id) return
    open.value = false
    emit('changed', updated)
  } catch (failure) {
    if (groupId === props.group.group_id) error.value = apiErrorMessage(failure)
  } finally {
    busy.value = false
  }
}

function saveChoice() {
  const bucket = choice.value.bucket || generated.value
  void save({ bucket, prefix: choice.value.prefix.trim() })
}
</script>

<template>
  <div v-if="location">
    <div class="flex items-center gap-2 px-5 pb-1 pt-4">
      <MapPin class="h-3.5 w-3.5 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Dataset location</h2>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div class="min-w-0 space-y-1">
        <p class="text-[11px] text-muted-foreground">
          Where new datasets of this group store their files. Each dataset gets its own folder, named after the dataset id.
          <DocsLink icon topic="dataset-git" section="Where pushed files are stored" class="ml-0.5" />
        </p>
        <dl v-if="canAdmin" class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt class="text-muted-foreground">Bucket</dt>
          <dd class="break-all">
            <RouterLink :to="folderRoute(location.bucket, '', group.group_id)" class="font-mono text-primary hover:underline">{{ location.bucket }}</RouterLink>
          </dd>
          <dt class="text-muted-foreground">Prefix</dt>
          <dd class="break-all font-mono text-foreground">{{ location.prefix || '(none)' }}</dd>
        </dl>
        <p v-else class="break-all text-xs text-foreground">
          New datasets go to: <span class="font-mono">{{ location.bucket }}/{{ location.prefix }}</span>
          <Badge v-if="isGenerated" size="sm" variant="outline" class="ml-1">Generated group bucket</Badge>
        </p>
        <p v-if="stored" class="text-[11px] text-muted-foreground">{{ stored }}</p>
        <p v-if="canAdmin" class="text-[11px] text-muted-foreground">Changing it does not move existing datasets or their files.</p>
      </div>
      <Button v-if="canAdmin" variant="ghost" size="sm" class="h-7 px-2 text-aruna-navy dark:text-foreground" @click="edit">Edit</Button>
    </div>

    <Dialog :open="open" @update:open="(value: boolean) => (open = value)">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change the dataset location</DialogTitle>
          <DialogDescription>
            New datasets store their files in this bucket and prefix, in a folder named after the dataset id.
            The bucket must exist on this node, belong to this group and allow writing.
          </DialogDescription>
        </DialogHeader>
        <StorageLocationFields v-model="choice" :group-id="group.group_id" prefix-placeholder="folder/" />
        <Notice>
          Existing datasets and their files stay where they are. Only datasets created after saving use the new location.
        </Notice>
        <Notice v-if="error" tone="error">{{ error }}</Notice>
        <DialogFooter class="sm:justify-between">
          <Button variant="ghost" size="sm" :disabled="busy" @click="save(null)">Use the generated group bucket</Button>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" :disabled="busy" @click="open = false">Cancel</Button>
            <Button size="sm" :disabled="busy" @click="saveChoice">{{ busy ? 'Saving' : 'Save' }}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
