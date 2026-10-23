<script setup lang="ts">
// The id of a file version in a bucket stored on several nodes. It names no node.
import { computed } from 'vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import { REALM_ID } from '@/lib/distributedMock'

const props = defineProps<{ versionId: string; contentHash?: string }>()

const short = computed(() => `/${REALM_ID}/${props.versionId}`)
const url = computed(() => `https://w3id.org/aruna/data/${REALM_ID}/${props.versionId}`)
const content = computed(() => (props.contentHash ? `https://w3id.org/aruna/data/${props.contentHash}` : ''))
</script>

<template>
  <dl class="space-y-2 text-xs">
    <div v-for="item in [
      { label: 'Short form', value: short },
      { label: 'URL', value: url },
      ...(content ? [{ label: 'By content', value: content }] : []),
    ]" :key="item.label" class="surface-inline flex items-center gap-2 px-3 py-2">
      <dt class="w-20 shrink-0 text-muted-foreground">{{ item.label }}</dt>
      <dd class="min-w-0 flex-1 break-all font-mono">{{ item.value }}</dd>
      <CopyButton :value="item.value" :label="`Copy ${item.label.toLowerCase()}`" />
    </div>
  </dl>
</template>
