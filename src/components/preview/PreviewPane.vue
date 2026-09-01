<script setup lang="ts">
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import PreviewBody from './PreviewBody.vue'
import { formatBytes } from '@/lib/utils'

const props = defineProps<{
  open: boolean
  bucket: string
  objectKey: string
  name: string
  size?: number
  contentType?: string
  /** Node hosting the bucket; null/absent = the connected node. */
  nodeId?: string | null
  referencedFrom?: {
    label: string
    connectorId?: string | null
    groupId?: string | null
    originNodeId?: string | null
  } | null
  probeReference?: boolean
}>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()
</script>

<template>
  <DetailDialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <template #header>
      <div class="min-w-0">
        <DialogTitle class="truncate text-base font-semibold text-foreground" :title="props.name">
          {{ props.name || 'Preview' }}
        </DialogTitle>
        <p class="mt-0.5 font-mono text-[11px] text-muted-foreground">
          <span class="break-all">{{ props.bucket }}/{{ props.objectKey }}</span>
          <span v-if="props.size !== undefined"> · {{ formatBytes(props.size) }}</span>
        </p>
      </div>
    </template>

    <PreviewBody
      :active="props.open"
      :bucket="props.bucket"
      :object-key="props.objectKey"
      :name="props.name"
      :size="props.size"
      :content-type="props.contentType"
      :node-id="props.nodeId"
      :referenced-from="props.referencedFrom"
      :probe-reference="props.probeReference"
    />
  </DetailDialog>
</template>
