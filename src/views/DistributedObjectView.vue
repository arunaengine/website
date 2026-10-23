<script setup lang="ts">
// Mock page of one file in a distributed bucket: its global id, the serving node and the holders.
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import GlobalId from '@/components/distributed/GlobalId.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import SourceInfo from '@/components/distributed/SourceInfo.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import { stamp } from '@/lib/distributedMock'
import { mockObject } from '@/lib/distributedMockData'
import { formatBytes } from '@/lib/utils'
import { MOCK_BASE } from '@/router/distributedMock'

const route = useRoute()
const object = computed(() => mockObject(String(route.query.file ?? '')))
const copied = ref(false)
</script>

<template>
  <div>
    <PageHeader :title="object?.key.split('/').pop() ?? 'Unknown file'" :description="object ? `${formatBytes(object.size)}, changed ${stamp(object.modified)}` : undefined">
      <template #breadcrumbs>
        <span>·</span>
        <RouterLink :to="MOCK_BASE" class="hover:underline">Distributed buckets</RouterLink>
        <template v-if="object">
          <span>·</span>
          <RouterLink :to="`${MOCK_BASE}/${object.bucket}?tab=files`" class="font-mono hover:underline">{{ object.bucket }}</RouterLink>
        </template>
      </template>
    </PageHeader>

    <div class="container space-y-5 py-6">
      <MockNotice />
      <EmptyState v-if="!object" title="No example file with this name" />
      <template v-else>
        <section class="surface space-y-3 p-5">
          <h2 class="font-display text-base font-semibold text-aruna-navy">Global id</h2>
          <p class="break-all font-mono text-xs text-muted-foreground">{{ object.key }}</p>
          <GlobalId :version-id="object.versionId" :content-hash="object.contentHash" />
          <p class="text-xs text-muted-foreground">The id names no node. Any node of the realm can resolve it.</p>
        </section>

        <section class="surface space-y-3 p-5">
          <h2 class="font-display text-base font-semibold text-aruna-navy">Served by</h2>
          <p class="flex items-center gap-2 text-sm">
            <NodeLabel :node-id="object.servedBy" /> <Badge variant="outline" size="sm">The node you are connected to</Badge>
          </p>
          <p class="text-xs text-muted-foreground">{{ object.how }}</p>
          <h3 class="pt-2 text-sm font-medium text-foreground">Holders of this version</h3>
          <ul class="divide-y divide-border rounded-md border border-border text-xs">
            <li v-for="holder in object.holders" :key="holder.nodeId" class="flex flex-wrap items-center gap-x-4 px-3 py-2">
              <NodeLabel :node-id="holder.nodeId" class="w-20 font-medium" />
              <span class="w-36">{{ holder.role }}</span>
              <span class="text-muted-foreground">{{ holder.bytes }}</span>
            </li>
          </ul>
        </section>

        <section v-if="object.external" class="surface space-y-3 p-5">
          <h2 class="font-display text-base font-semibold text-aruna-navy">Registered from an external source</h2>
          <SourceInfo :info="object.external" @copy="copied = true" />
          <Notice v-if="copied" tone="success">Mock, nothing changed: the file would be copied into the bucket and get a content hash.</Notice>
        </section>

        <section class="surface space-y-2 p-5">
          <h2 class="font-display text-base font-semibold text-aruna-navy">Datasets that use this file</h2>
          <ul class="list-disc space-y-0.5 pl-5 text-sm">
            <li v-for="title in object.datasets" :key="title">{{ title }}</li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>
