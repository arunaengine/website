<script setup lang="ts">
import { computed } from 'vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { truncateMiddle } from '@/lib/utils'

const props = withDefaults(
  defineProps<{ nodeId: string; copy?: boolean; size?: 'sm' | 'md' }>(),
  { copy: false, size: 'md' },
)

const { nodeById, displayName } = useRealmNodes()

// A realm node is worth naming; anything else stays an honest short id.
const known = computed(() => Boolean(nodeById(props.nodeId)))
</script>

<template>
  <span v-if="nodeId" class="inline-flex min-w-0 items-center gap-1">
    <span v-if="known" class="truncate text-xs" :title="nodeById(nodeId)?.title ?? nodeId">
      {{ displayName(nodeId) }}
    </span>
    <span v-else class="hash truncate text-xs" :title="nodeId">
      {{ truncateMiddle(nodeId, 8, 6) }}
    </span>
    <CopyButton v-if="copy" :value="nodeId" label="Copy node id" />
  </span>
</template>
