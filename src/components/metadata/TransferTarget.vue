<script setup lang="ts">
// Group, bucket and key prefix of a transfer target. The fields render as
// siblings inside the host's grid; the default slot sits after the group.
import { computed, ref, useId, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Select from '@/components/ui/Select.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import { useAruna } from '@/composables/useAruna'
import { useBuckets } from '@/composables/useBuckets'
import { useBucketShortcuts } from '@/composables/useBucketShortcuts'
import { useS3 } from '@/composables/useS3'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { FolderPlus, FolderTree } from '@lucide/vue'

const props = defineProps<{ active: boolean }>()
const emit = defineEmits<{ (e: 'navigate'): void }>()
const groupId = defineModel<string>('groupId', { required: true })
const bucket = defineModel<string>('bucket', { required: true })
const prefix = defineModel<string>('prefix', { required: true })

const { groups } = useAruna()
const uid = useId()
const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))

const s3 = useS3()
const bucketList = useBuckets()
const bucketsLoading = bucketList.loading
const bucketsLoaded = bucketList.loaded
const bucketsError = bucketList.error
const shortcuts = useBucketShortcuts()

// Browsing the target needs an S3 session, the import API only needs realm
// auth, so without a key bucket and prefix stay free text.
const canBrowse = computed(() => s3.hasActiveKey.value && Boolean(s3.endpoint.value))
const browseAuthError = ref(false)
const browserOpen = ref(false)
const newSegment = ref('')

const bucketOptions = computed(() => {
  const names = bucketList.buckets.value
    .map((entry) => entry.name)
    .filter((name) => !isWorkspaceBucket(name))
  const typed = bucket.value.trim()
  // A hand-typed target stays selected when the list arrives later.
  if (typed && !names.includes(typed)) names.push(typed)
  return names.map((name) => ({ value: name, label: name }))
})

const authRejected = computed(() => bucketList.authError.value || browseAuthError.value)
const pickBucket = computed(
  () => canBrowse.value && !authRejected.value && bucketOptions.value.length > 0,
)

const browseHint = computed(() => {
  if (!s3.endpoint.value) return 'This node advertises no S3 endpoint, so the target is typed by hand.'
  if (!s3.hasActiveKey.value) return 'S3 credentials from Data unlock the bucket picker; the import itself does not need them.'
  if (authRejected.value) return 'Your S3 credentials were rejected, so the target cannot be browsed.'
  if (bucketList.loaded.value && !bucketOptions.value.length) return 'No buckets are visible with this key, type the target name.'
  return null
})

const targetPath = computed(() => {
  const folder = prefix.value.trim().replace(/^\/+|\/+$/g, '')
  return `s3://${bucket.value.trim() || 'bucket'}/${folder ? `${folder}/` : ''}`
})

const segmentInvalid = computed(() => {
  const name = newSegment.value.trim()
  return !name || name.includes('/')
})

// The browsed folder is the target; it is a plain prefix, so navigating is
// enough to pick it.
function onNavigate(location: { bucket: string; prefix: string }) {
  if (location.bucket !== bucket.value) return
  prefix.value = location.prefix.replace(/\/+$/, '')
}

// Import targets usually do not exist yet: the job writes the keys, so a new
// segment is appended to the browsed folder instead of being created here.
function addSegment() {
  if (segmentInvalid.value) return
  const base = prefix.value.trim().replace(/^\/+|\/+$/g, '')
  prefix.value = base ? `${base}/${newSegment.value.trim()}` : newSegment.value.trim()
  newSegment.value = ''
}

function onBrowseFailure() {
  browseAuthError.value = true
  browserOpen.value = false
}

// Another bucket is another key space; the picked prefix never carries over.
function onBucketPick(next: string) {
  bucket.value = next
  prefix.value = ''
  newSegment.value = ''
}

// Prefer the last browsed bucket, then the only one on offer.
function preselectBucket() {
  if (bucket.value || !bucketOptions.value.length) return
  const names = new Set(bucketOptions.value.map((option) => option.value))
  const known = [...shortcuts.recent.value, ...shortcuts.pinned.value].find(
    (entry) => !entry.nodeId && names.has(entry.bucket),
  )
  const only = bucketOptions.value.length === 1 ? bucketOptions.value[0] : undefined
  if (known) bucket.value = known.bucket
  else if (only) bucket.value = only.value
}

watch(
  [() => props.active, () => s3.activeKey.value, () => s3.endpoint.value],
  ([active, key, endpoint]) => {
    if (!active) return
    browseAuthError.value = false
    if (!key || !endpoint) return
    void bucketList.ensure().then(preselectBucket)
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <label class="text-xs font-medium text-foreground">Group</label>
    <GroupSelect
      v-model="groupId"
      :options="groupOptions"
      placeholder="Choose a group"
      class="mt-1"
      @navigate="emit('navigate')"
    />
  </div>
  <slot />
  <div>
    <label :for="pickBucket ? undefined : `${uid}-bucket`" class="text-xs font-medium text-foreground">Target bucket</label>
    <Select
      v-if="pickBucket"
      :model-value="bucket"
      :options="bucketOptions"
      placeholder="Choose a bucket"
      aria-label="Target bucket"
      class="mt-1"
      @update:model-value="onBucketPick"
    />
    <Input v-else :id="`${uid}-bucket`" v-model="bucket" placeholder="my-bucket" class="mt-1" />
    <Spinner
      v-if="bucketsLoading && !bucketsLoaded"
      show-label
      label="Loading buckets…"
      class="mt-1 flex text-[11px]"
    />
    <p v-else-if="bucketsError && !authRejected" class="mt-1 text-[11px] text-destructive">{{ bucketsError }}</p>
  </div>
  <div>
    <div class="flex items-center justify-between gap-2">
      <label :for="`${uid}-prefix`" class="text-xs font-medium text-foreground">Key prefix</label>
      <Button
        v-if="canBrowse && !authRejected && bucket"
        variant="ghost"
        size="sm"
        class="h-5 px-1 text-[11px]"
        @click="browserOpen = !browserOpen"
      >
        <FolderTree class="size-3" /> {{ browserOpen ? 'Hide folders' : 'Browse folders' }}
      </Button>
    </div>
    <Input :id="`${uid}-prefix`" v-model="prefix" placeholder="optional/prefix" class="mt-1" />
  </div>

  <div v-if="browserOpen && canBrowse && bucket" class="space-y-2 rounded-md border border-border p-2 sm:col-span-2">
    <ObjectBrowserPanel :bucket="bucket" :prefix="prefix" @navigate="onNavigate" @auth-error="onBrowseFailure" />
    <div class="flex flex-wrap items-center gap-2">
      <Input
        v-model="newSegment"
        class="h-8 w-44 font-mono text-xs"
        placeholder="new-subfolder"
        aria-label="New subfolder name"
        @keydown.enter.prevent="addSegment"
      />
      <Button variant="outline" size="sm" :disabled="segmentInvalid" @click="addSegment">
        <FolderPlus class="size-3.5" /> Add subfolder
      </Button>
      <span class="text-[11px] text-muted-foreground">The prefix does not have to exist, the import creates it.</span>
    </div>
  </div>

  <p class="text-[11px] text-muted-foreground sm:col-span-2">
    Payload lands in <code class="rounded bg-muted px-1 font-mono">{{ targetPath }}</code>
    <template v-if="browseHint"> · {{ browseHint }}</template>
  </p>
</template>
