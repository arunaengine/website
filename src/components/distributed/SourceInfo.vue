<script setup lang="ts">
// What the portal knows about an external file: where it comes from and how it is checked.
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import DetailList from '@/components/ui/DetailList.vue'
import Notice from '@/components/ui/Notice.vue'
import { stamp } from '@/lib/distributedMock'
import type { ExternalInfo } from '@/lib/distributedMockData'

defineProps<{ info: ExternalInfo }>()
const emit = defineEmits<{ (e: 'copy'): void }>()
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <Badge v-if="info.notPinned" variant="warn" size="sm">Not pinned</Badge>
      <Badge v-else variant="success" size="sm">Pinned to this version</Badge>
    </div>
    <Notice v-if="info.notPinned" tone="warning" title="This file cannot be pinned">
      {{ info.notPinned }} A dataset version that uses it marks the file as not pinned.
      <Button size="sm" variant="outline" class="mt-2 block" @click="emit('copy')">Copy into the bucket to pin it</Button>
    </Notice>
    <DetailList
      :items="[
        { label: 'Source', value: info.source, mono: true },
        { label: 'ETag', value: info.etag ?? 'The source sends none', mono: Boolean(info.etag) },
        { label: 'Last refresh', value: stamp(info.refreshed) },
      ]"
    />
    <div v-if="info.digests.length" class="overflow-x-auto rounded-md border border-border">
      <table class="w-full min-w-[40rem] text-left text-xs">
        <thead class="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Algorithm</th>
            <th class="px-3 py-2 font-medium">Digest</th>
            <th class="px-3 py-2 font-medium">Scope</th>
            <th class="px-3 py-2 font-medium">Origin</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="digest in info.digests" :key="digest.algorithm">
            <td class="px-3 py-2">{{ digest.algorithm }}</td>
            <td class="break-all px-3 py-2 font-mono text-[11px]">{{ digest.digest }}</td>
            <td class="px-3 py-2">{{ digest.scope }}</td>
            <td class="px-3 py-2">{{ digest.origin }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="text-xs text-muted-foreground">The source gives no checksum for this file.</p>
  </div>
</template>
