<script setup lang="ts">
// All details of the listed databases, shown while no bucket is open.
import { RouterLink } from 'vue-router'
import MockNotice from '@/components/distributed/MockNotice.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useMockDatabases } from '@/composables/useMockDatabases'
import { databaseStats } from '@/lib/distributedMockData'
import { formatCount } from '@/lib/formatCount'
import { formatBytes } from '@/lib/utils'

const { entries } = useMockDatabases()
</script>

<template>
  <section class="surface space-y-3 p-4">
    <div>
      <h2 class="font-display text-base font-semibold text-aruna-navy">Databases</h2>
      <p class="text-xs text-muted-foreground">
        Databases your realm admins listed for everyone to use. Each one is an ordinary bucket: open it to browse its files.
      </p>
    </div>
    <MockNotice />
    <EmptyState v-if="!entries.length" title="No databases are listed yet" description="Realm admins add them under Admin, Databases." />
    <div v-else class="overflow-x-auto rounded-md border border-border">
      <table class="w-full min-w-[56rem] text-left text-xs">
        <thead class="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Database</th>
            <th class="px-3 py-2 font-medium">Source</th>
            <th class="px-3 py-2 font-medium">License</th>
            <th class="px-3 py-2 text-right font-medium">Size</th>
            <th class="px-3 py-2 text-right font-medium">Files</th>
            <th class="px-3 py-2 font-medium">Refresh</th>
            <th class="px-3 py-2 font-medium">Who may read</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="entry in entries" :key="entry.id">
            <td class="px-3 py-2">
              <RouterLink :to="{ name: 'bucket', params: { bucketId: entry.bucket } }" class="font-medium text-primary hover:underline">{{ entry.name }}</RouterLink>
              <p class="text-muted-foreground">{{ entry.description }}</p>
            </td>
            <td class="px-3 py-2">{{ entry.source }}</td>
            <td class="px-3 py-2">{{ entry.license }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ formatBytes(databaseStats(entry.bucket).bytes) }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ formatCount(databaseStats(entry.bucket).files) }}</td>
            <td class="px-3 py-2">{{ entry.refresh }}</td>
            <td class="px-3 py-2">{{ entry.readers }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
