<script setup lang="ts">
// One bucket link inside the conversation. It always navigates, so the chat
// comes along as the panel where the surface asks for that, and a modified
// click still opens the data browser in a new tab.
import { computed } from 'vue'
import { bucketHref } from '@/lib/assistant/objectLinks'
import { useAssistantObject } from '@/composables/useAssistantObject'

const props = defineProps<{ bucket: string }>()

const { follow } = useAssistantObject()
const href = computed(() => bucketHref(props.bucket))

function onClick(event: MouseEvent) {
  follow(event, href.value)
}
</script>

<template>
  <a :href="href" :data-bucket="props.bucket" @click="onClick"><slot /></a>
</template>
