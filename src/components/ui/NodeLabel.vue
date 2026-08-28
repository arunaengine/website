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
const sizeClass = computed(() => (props.size === 'sm' ? 'text-[11px]' : 'text-xs'))
</script>

<template>
  <span v-if="nodeId" class="inline-flex min-w-0 items-center gap-1">
    <span v-if="known" class="truncate" :class="sizeClass" :title="nodeId">
      {{ displayName(nodeId) }}
    </span>
    <span v-else class="hash truncate" :class="sizeClass" :title="nodeId">
      {{ truncateMiddle(nodeId, 8, 6) }}
    </span>
    <CopyButton v-if="copy" :value="nodeId" label="Copy node id" />
  </span>
</template>
