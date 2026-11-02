<script setup lang="ts">
// A dataset the assistant asked to show. A run record leads with its state, when
// and where it ran, and what went in and came out; any other dataset with its
// description, size, owner and last change. Unknown facts are left out.
import { computed, defineAsyncComponent, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import { datasetCard, inputsText, outputsText, runCard, runSettled, sizeRow } from '@/lib/assistant/crateCard'
import type { DatasetSummary } from '@/lib/assistant/types'
import { folderRoute } from '@/lib/crate/dataIdentity'
import { crateGraph } from '@/lib/dataEntities'
import { stateVariant } from '@/lib/stateBadge'
import { formatDate, formatDateTime, relativeTime } from '@/lib/utils'
import { Package, Waypoints, Workflow } from '@lucide/vue'

// The graph carries Vue Flow and dagre; only a card that shows it pays.
const CrateGraph = defineAsyncComponent(() => import('@/components/metadata/CrateGraph.vue'))

const props = defineProps<{ title: string; crate: unknown; documentId?: string; summary?: DatasetSummary }>()

const run = computed(() => runCard(props.crate))
const dataset = computed(() => datasetCard(props.crate))

const label = (state: string) => state.charAt(0).toUpperCase() + state.slice(1)

const settled = computed(() => Boolean(run.value && runSettled(run.value)))
const inputs = computed(() => (run.value ? inputsText(run.value) : ''))
const outputs = computed(() => (run.value ? outputsText(run.value) : ''))
const folder = computed(() => {
  const value = run.value?.folder
  return value ? { path: `${value.bucket}/${value.prefix ? `${value.prefix}/` : ''}`, to: folderRoute(value.bucket, value.prefix) } : null
})
const size = computed(() => sizeRow(dataset.value))

// A card that only carries the dataset's id has nothing to draw.
const hasGraph = computed(() => crateGraph(props.crate).length > 0)
const graphShown = ref(false)
</script>

<template>
  <div class="surface-inline overflow-hidden text-xs">
    <div class="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
      <component :is="run ? Workflow : Package" class="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <RouterLink
        v-if="documentId"
        :to="{ name: 'dataset', params: { id: documentId } }"
        class="min-w-0 flex-1 truncate font-medium text-foreground hover:text-primary hover:underline"
      >{{ title }}</RouterLink>
      <span v-else class="min-w-0 flex-1 truncate font-medium text-foreground">{{ title }}</span>
      <Badge v-if="run?.state" size="sm" :variant="stateVariant(run.state)">{{ label(run.state) }}</Badge>
      <Badge v-else-if="!run && summary?.public !== undefined" size="sm" variant="secondary">
        {{ summary.public ? 'Public' : 'Private' }}
      </Badge>
    </div>
    <div class="space-y-2.5 px-3 py-2.5">
      <template v-if="run">
        <dl class="space-y-1">
          <div v-if="settled && run.finishedAt" class="flex gap-2">
            <dt class="w-16 shrink-0 text-muted-foreground">Finished</dt>
            <dd class="text-foreground/85">
              {{ formatDateTime(run.finishedAt) }} <span class="text-muted-foreground">({{ relativeTime(run.finishedAt) }})</span>
            </dd>
          </div>
          <div v-else-if="run.startedAt" class="flex gap-2">
            <dt class="w-16 shrink-0 text-muted-foreground">Started</dt>
            <dd class="text-foreground/85">
              {{ formatDateTime(run.startedAt) }} <span class="text-muted-foreground">({{ relativeTime(run.startedAt) }})</span>
            </dd>
          </div>
          <div v-if="settled && run.duration" class="flex gap-2">
            <dt class="w-16 shrink-0 text-muted-foreground">Took</dt>
            <dd class="text-foreground/85">{{ run.duration }}</dd>
          </div>
          <div v-if="run.nodeId" class="flex gap-2">
            <dt class="w-16 shrink-0 text-muted-foreground">{{ settled ? 'Ran on' : 'Runs on' }}</dt>
            <dd class="min-w-0">
              <RouterLink :to="{ name: 'status', query: { node: run.nodeId } }" class="text-primary hover:underline">
                <NodeLabel :node-id="run.nodeId" />
              </RouterLink>
            </dd>
          </div>
          <div v-if="run.tool" class="flex gap-2">
            <dt class="w-16 shrink-0 text-muted-foreground">Tool</dt>
            <dd class="min-w-0 truncate text-foreground/85">{{ run.tool }}</dd>
          </div>
          <div v-if="run.inputFiles" class="flex gap-2">
            <dt class="w-16 shrink-0 text-muted-foreground">Inputs</dt>
            <dd class="min-w-0 space-y-1">
              <p class="text-foreground/85">{{ inputs }}</p>
              <div v-if="run.inputDatasets.length" class="flex flex-wrap gap-1">
                <template v-for="source in run.inputDatasets" :key="source.id">
                  <a
                    v-if="source.link"
                    :href="source.link"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="chip text-primary hover:bg-muted"
                  >{{ source.name }}</a>
                  <span v-else class="chip">{{ source.name }}</span>
                </template>
              </div>
            </dd>
          </div>
          <div v-if="run.outputFiles" class="flex gap-2">
            <dt class="w-16 shrink-0 text-muted-foreground">Outputs</dt>
            <dd class="min-w-0">
              <span class="text-foreground/85">{{ outputs }}{{ folder ? ' in' : '' }}</span>
              <RouterLink
                v-if="folder"
                :to="folder.to"
                class="ml-1 font-mono text-[11px] text-primary hover:underline"
              >{{ folder.path }}</RouterLink>
            </dd>
          </div>
        </dl>
        <Notice v-if="run.error" tone="error">{{ run.error }}</Notice>
      </template>

      <template v-else>
        <p v-if="dataset.description" class="line-clamp-2 leading-relaxed text-foreground/85">{{ dataset.description }}</p>
        <dl v-if="size || summary?.groupName || summary?.updatedAt" class="space-y-1">
          <div v-if="size" class="flex gap-2">
            <dt class="w-16 shrink-0 text-muted-foreground">{{ size.label }}</dt>
            <dd class="text-foreground/85">{{ size.value }}</dd>
          </div>
          <div v-if="summary?.groupName && summary.groupId" class="flex gap-2">
            <dt class="w-16 shrink-0 text-muted-foreground">Owner</dt>
            <dd class="min-w-0 truncate">
              <RouterLink :to="{ name: 'group', params: { id: summary.groupId } }" class="text-primary hover:underline">
                {{ summary.groupName }}
              </RouterLink>
            </dd>
          </div>
          <div v-if="summary?.updatedAt && formatDate(summary.updatedAt)" class="flex gap-2">
            <dt class="w-16 shrink-0 text-muted-foreground">Updated</dt>
            <dd class="text-foreground/85">{{ formatDate(summary.updatedAt) }}</dd>
          </div>
        </dl>
      </template>

      <div v-if="hasGraph || documentId" class="flex items-center gap-3">
        <Button
          v-if="hasGraph"
          variant="outline"
          size="sm"
          class="h-7 text-[11px]"
          :aria-pressed="graphShown"
          @click="graphShown = !graphShown"
        >
          <Waypoints class="size-3.5" /> {{ graphShown ? 'Hide graph' : 'Show graph' }}
        </Button>
        <RouterLink
          v-if="documentId"
          :to="{ name: 'dataset', params: { id: documentId } }"
          class="font-medium text-primary hover:underline"
        >
          {{ run ? 'Open the run' : 'Open the dataset' }}
        </RouterLink>
      </div>
      <CrateGraph v-if="graphShown" :source="crate" mode="view" height="16rem" />
    </div>
  </div>
</template>
