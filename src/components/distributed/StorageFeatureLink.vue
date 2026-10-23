<script setup lang="ts">
// Points at the question of the storage feature guide that matches the setting next to it.
import DocsLink from '@/components/ui/DocsLink.vue'
import { mockEnabled, STORAGE_QUESTIONS, type StorageQuestion } from '@/lib/distributedMock'

defineProps<{ question: StorageQuestion; icon?: boolean }>()
</script>

<template>
  <DocsLink
    v-if="mockEnabled()"
    topic="storage-features"
    :section="STORAGE_QUESTIONS[question]"
    :icon="icon"
    :label="icon ? undefined : 'Which storage feature do I need?'"
  />
</template>
