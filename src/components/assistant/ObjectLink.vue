<script setup lang="ts">
// One stored-object link inside the conversation. It opens the file over the
// chat where the surface offers that, routes to the data browser otherwise,
// and always keeps a real href so a modified click opens a page as usual.
import { computed } from 'vue'
import { objectHref } from '@/lib/assistant/objectLinks'
import { useAssistantObject } from '@/composables/useAssistantObject'

const props = defineProps<{
  bucket: string
  objectKey: string
  name?: string
  size?: number
  nodeId?: string | null
}>()

const { follow } = useAssistantObject()
const href = computed(() => objectHref({ bucket: props.bucket, key: props.objectKey }))

function onClick(event: MouseEvent) {
  follow(event, href.value, {
    bucket: props.bucket,
    key: props.objectKey,
    name: props.name,
    size: props.size,
    nodeId: props.nodeId,
  })
}
</script>

<template>
  <a :href="href" :data-object="props.objectKey" @click="onClick"><slot /></a>
</template>
