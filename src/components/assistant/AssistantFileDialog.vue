<script setup lang="ts">
// The file a link in the conversation asks for, opened over the chat so the
// link never leaves it. Mounting this registers the opener for its surface.
import { defineAsyncComponent, ref } from 'vue'
import { activeGroupId } from '@/composables/useGroupSelection'
import { provideObjectOpener, type ObjectTarget } from '@/composables/useAssistantObject'
import { objectHref } from '@/lib/assistant/objectLinks'

// Only loaded once a link asks for a file.
const FileDetailsDialog = defineAsyncComponent(() => import('@/components/data/FileDetailsDialog.vue'))

/** Set in the panel, which floats above the modal layer. */
defineProps<{ raised?: boolean }>()

const target = ref<ObjectTarget | null>(null)
const tab = ref('preview')
provideObjectOpener((next) => {
  target.value = next
  tab.value = 'preview'
})
</script>

<template>
  <FileDetailsDialog
    v-if="target"
    :raised="raised"
    :open="true"
    :tab="tab"
    :bucket="target.bucket"
    :object-key="target.key"
    :name="target.name ?? target.key.split('/').pop() ?? target.key"
    :size="target.size"
    :node-id="target.nodeId ?? null"
    :group-id="activeGroupId || null"
    :browse-href="objectHref({ bucket: target.bucket, key: target.key })"
    @update:open="(value: boolean) => { if (!value) target = null }"
    @update:tab="(value: string) => (tab = value)"
  />
</template>
