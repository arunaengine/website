<script setup lang="ts">
// A stored object the assistant asked to show: where it lives, how big it is,
// which version it is, and a link into the data browser.
import { computed } from 'vue'
import BucketLink from '@/components/assistant/BucketLink.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import ObjectLink from '@/components/assistant/ObjectLink.vue'
import type { ObjectView } from '@/lib/assistant/types'
import { formatBytes, relativeTime, truncateMiddle } from '@/lib/utils'
import { Eye, FileText } from '@lucide/vue'

const props = defineProps<{ view: ObjectView }>()

interface Fact {
  label: string
  value: string
  at?: string
}

const path = computed(() => `${props.view.bucket}/${props.view.key}`)
const name = computed(() => props.view.key.split('/').pop() || props.view.key)

const facts = computed<Fact[]>(() => [
  ...(props.view.size !== undefined ? [{ label: 'Size', value: formatBytes(props.view.size) }] : []),
  ...(props.view.contentType ? [{ label: 'Type', value: props.view.contentType }] : []),
  ...(props.view.lastModified
    ? [{ label: 'Changed', value: relativeTime(props.view.lastModified), at: props.view.lastModified }]
    : []),
])
</script>

<template>
  <div class="surface-inline overflow-hidden text-xs">
    <div class="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
      <FileText class="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <ObjectLink
        :bucket="view.bucket"
        :object-key="view.key"
        :name="name"
        :size="view.size"
        :node-id="view.nodeId"
        class="min-w-0 flex-1 truncate font-medium text-foreground hover:text-primary hover:underline"
        :title="`Open ${path}`"
      >{{ name }}</ObjectLink>
      <ObjectLink
        :bucket="view.bucket"
        :object-key="view.key"
        :name="name"
        :size="view.size"
        :node-id="view.nodeId"
        class="chip shrink-0 text-primary hover:bg-muted"
        title="Open the file viewer"
      >
        <Eye class="size-3 shrink-0" aria-hidden="true" />
        Open
      </ObjectLink>
      <CopyButton :value="path" label="Copy the object path" />
    </div>
    <div class="space-y-2 px-3 py-2.5">
      <p v-if="view.caption" class="leading-relaxed text-foreground/85">{{ view.caption }}</p>

      <p class="hash min-w-0 truncate" :title="path">
        <BucketLink
          :bucket="view.bucket"
          class="text-primary hover:underline"
          :title="`Open the bucket ${view.bucket}`"
        >{{ view.bucket }}</BucketLink>/<ObjectLink
          :bucket="view.bucket"
          :object-key="view.key"
          :name="name"
          :size="view.size"
          :node-id="view.nodeId"
          class="text-primary hover:underline"
          :title="`Open ${path}`"
        >{{ view.key }}</ObjectLink>
      </p>

      <dl class="space-y-0.5">
        <div v-for="fact in facts" :key="fact.label" class="flex items-baseline gap-2">
          <dt class="w-16 shrink-0 text-muted-foreground">{{ fact.label }}</dt>
          <dd class="min-w-0 truncate text-foreground/85" :title="fact.at">{{ fact.value }}</dd>
        </div>
        <div v-if="view.versionId" class="flex items-center gap-2">
          <dt class="w-16 shrink-0 text-muted-foreground">Version</dt>
          <dd class="flex min-w-0 items-center gap-1">
            <span class="hash truncate" :title="view.versionId">{{ truncateMiddle(view.versionId, 8, 5) }}</span>
            <CopyButton :value="view.versionId" label="Copy the version id" />
          </dd>
        </div>
        <div v-if="view.nodeId" class="flex items-center gap-2">
          <dt class="w-16 shrink-0 text-muted-foreground">Node</dt>
          <dd class="flex min-w-0 items-center gap-1">
            <span class="hash truncate" :title="view.nodeId">{{ truncateMiddle(view.nodeId, 8, 5) }}</span>
            <CopyButton :value="view.nodeId" label="Copy the node id" />
          </dd>
        </div>
      </dl>
    </div>
  </div>
</template>
