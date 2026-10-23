<script setup lang="ts">
// Entry of the distributed bucket mock: example buckets and the other mock pages.
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import { presetById } from '@/lib/distributedMock'
import { degradedRanges, MOCK_BUCKETS } from '@/lib/distributedMockData'
import { MOCK_BASE } from '@/router/distributedMock'
import { formatNumber } from '@/lib/utils'
import { Plus, Search, Upload } from '@lucide/vue'
</script>

<template>
  <div>
    <PageHeader
      :docs="{ topic: 'where-data-lives', section: 'Buckets' }"
      title="Distributed buckets"
      description="One bucket name on several nodes. Each file has one node that writes it and any number of copies that serve reads."
    >
      <template #breadcrumbs>
        <span>·</span>
        <RouterLink :to="{ name: 'buckets' }" class="hover:underline">Data</RouterLink>
      </template>
      <template #actions>
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="`${MOCK_BASE}/search`"><Search class="size-3.5" /> Search</RouterLink>
        </Button>
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="`${MOCK_BASE}/register`"><Upload class="size-3.5" /> Register a collection</RouterLink>
        </Button>
        <Button size="sm" as-child>
          <RouterLink :to="`${MOCK_BASE}/new`"><Plus class="size-3.5" /> New distributed bucket</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <div class="container space-y-5 py-6">
      <MockNotice />
      <ul class="space-y-3">
        <li v-for="bucket in MOCK_BUCKETS" :key="bucket.name">
          <RouterLink :to="`${MOCK_BASE}/${bucket.name}`" class="surface block p-4 transition-colors hover:border-primary/40">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-sm font-medium text-foreground">{{ bucket.name }}</span>
              <Badge variant="outline" size="sm">{{ presetById(bucket.preset).label }}</Badge>
              <Badge v-if="degradedRanges(bucket).length" variant="warn" size="sm">Degraded</Badge>
              <Badge v-else variant="success" size="sm">Active</Badge>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">{{ bucket.description }}</p>
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{{ bucket.members.length }} nodes:</span>
              <span class="flex flex-wrap gap-2">
                <NodeLabel v-for="member in bucket.members" :key="member.nodeId" :node-id="member.nodeId" size="sm" />
              </span>
              <span>{{ formatNumber(bucket.ranges.length) }} {{ bucket.ranges.length === 1 ? 'range' : 'ranges' }}</span>
            </div>
          </RouterLink>
        </li>
      </ul>
    </div>
  </div>
</template>
