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
      <table class="w-full text-left text-xs">
        <thead class="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Database</th>
            <th class="px-3 py-2 font-medium">Source, license, refresh</th>
            <th class="px-3 py-2 font-medium">Size, files</th>
            <th class="px-3 py-2 font-medium">Who may read</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="entry in entries" :key="entry.id" class="align-top">
            <td class="px-3 py-2">
              <RouterLink :to="{ name: 'bucket', params: { bucketId: entry.bucket } }" class="font-medium text-primary hover:underline">{{ entry.name }}</RouterLink>
              <p class="text-muted-foreground">{{ entry.description }}</p>
            </td>
            <td class="px-3 py-2">
              {{ entry.source }}
              <p class="text-muted-foreground">{{ entry.license }} · Refresh: {{ entry.refresh.toLowerCase() }}</p>
            </td>
            <td class="px-3 py-2 tabular-nums">
              {{ formatBytes(databaseStats(entry.bucket).bytes) }}
              <p class="text-muted-foreground">{{ formatCount(databaseStats(entry.bucket).files) }} files</p>
            </td>
            <td class="px-3 py-2">{{ entry.readers }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
