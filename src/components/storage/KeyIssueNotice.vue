<script setup lang="ts">
// Says for a few seconds how many waiting people got encryption keys at the last vault opening.
import { computed } from 'vue'
import Notice from '@/components/ui/Notice.vue'
import { useKeyIssue } from '@/composables/useKeyIssue'

const { issued, watchVault } = useKeyIssue()
watchVault()

const summary = computed(() => {
  const count = issued.value
  if (!count) return ''
  const people = count.people === 1 ? '1 person was' : `${count.people} people were`
  const buckets = count.buckets === 1 ? '1 bucket' : `${count.buckets} buckets`
  return `${people} waiting for access to ${buckets}. They can read now.`
})
</script>

<template>
  <Notice
    v-if="issued"
    tone="success"
    title="Encryption keys issued"
    class="fixed bottom-24 left-4 z-50 w-80 max-w-[calc(100vw-2rem)] bg-card shadow-lg md:bottom-6"
  >
    <p>{{ summary }}</p>
  </Notice>
</template>
