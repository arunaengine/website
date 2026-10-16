<script setup lang="ts">
// Bucket and prefix for a dataset's files: the group's buckets on this node, and
// the generated bucket, which is always offered.
import { computed, ref, watch } from 'vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import { refreshContext } from '@/composables/aruna/state'
import { listGroupBuckets } from '@/lib/api'
import { defaultStorageBucket } from '@/lib/crate/dataIdentity'

const props = defineProps<{
  groupId: string
  /** An empty bucket shows the default bucket until one is picked. */
  modelValue: { bucket: string; prefix: string }
  prefixPlaceholder: string
  /** The group's default location, labelled as such. */
  defaultLocation?: { bucket: string; prefix: string } | null
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: { bucket: string; prefix: string }): void }>()

const listed = ref<string[]>([])
const listing = ref<'idle' | 'loading' | 'done' | 'unavailable'>('idle')
let generation = 0

const defaultBucket = computed(() => defaultStorageBucket(props.groupId))
watch(() => props.groupId, async (groupId) => {
  const current = ++generation
  listed.value = []
  if (!groupId) {
    listing.value = 'unavailable'
    return
  }
  listing.value = 'loading'
  try {
    const names = await listGroupBuckets(groupId, refreshContext().client)
    if (current !== generation) return
    listed.value = names
    listing.value = 'done'
  } catch {
    if (current === generation) listing.value = 'unavailable'
  }
}, { immediate: true })

const shownBucket = computed(() => props.modelValue.bucket || props.defaultLocation?.bucket || defaultBucket.value)

const options = computed(() => {
  const groupBucket = props.defaultLocation?.bucket
  const names = [...new Set([groupBucket, defaultBucket.value, props.modelValue.bucket, ...listed.value].filter(Boolean))] as string[]
  return names.map((name) => ({
    value: name,
    label: name === groupBucket ? `${name} (group default)` : !groupBucket && name === defaultBucket.value ? `${name} (default)` : name,
  }))
})

function pickBucket(value: string) {
  emit('update:modelValue', { ...props.modelValue, bucket: value })
}
</script>

<template>
  <div class="grid gap-2 sm:grid-cols-2">
    <div>
      <label class="text-[11px] font-medium text-muted-foreground">Bucket</label>
      <Select
        class="mt-1"
        :options="options"
        :model-value="shownBucket"
        aria-label="Storage bucket"
        @update:model-value="pickBucket"
      />
    </div>
    <div>
      <label class="text-[11px] font-medium text-muted-foreground">Prefix</label>
      <Input
        class="mt-1 font-mono text-xs"
        :model-value="modelValue.prefix"
        :placeholder="prefixPlaceholder"
        aria-label="Storage prefix"
        @update:model-value="(value: string | number) => emit('update:modelValue', { bucket: shownBucket, prefix: String(value) })"
      />
    </div>
    <p v-if="listing === 'loading'" class="text-[11px] text-muted-foreground sm:col-span-2">Loading the group's buckets.</p>
    <p v-else-if="listing === 'unavailable'" class="text-[11px] text-muted-foreground sm:col-span-2">
      The group's other buckets could not be listed.
    </p>
  </div>
</template>
