<script setup lang="ts">
// Registers every file of an external collection in a bucket stored on several nodes.
// Only records are stored. The bytes stay at the source until a file is read.
import { ref } from 'vue'
import ImportProgress from '@/components/distributed/ImportProgress.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import Button from '@/components/ui/Button.vue'
import DetailList from '@/components/ui/DetailList.vue'
import Notice from '@/components/ui/Notice.vue'
import Switch from '@/components/ui/Switch.vue'
import { BAKREP_COUNT, BAKREP_ENDPOINT, sourceName } from '@/lib/distributedMockData'

defineProps<{ bucket: string }>()

const dataset = ref(true)
const started = ref(false)
</script>

<template>
  <div class="space-y-4">
    <MockNotice />
    <template v-if="!started">
      <p class="text-sm text-muted-foreground">
        List the files of an external collection once. Browsing and file name search in
        <span class="font-mono">{{ bucket }}</span> then need no request to the source.
      </p>
      <DetailList
        :items="[
          { label: 'Endpoint', value: BAKREP_ENDPOINT, mono: true },
          { label: 'Access', value: 'Public, no credentials' },
          { label: 'Source buckets', value: `${BAKREP_COUNT}: ${sourceName(0)} to ${sourceName(BAKREP_COUNT - 1)}` },
          { label: 'Files', value: 'About 50 million' },
        ]"
      />
      <p class="text-xs text-muted-foreground">
        Keys start with the name of the source bucket, so the file
        <span class="font-mono">GCF_000005845.2/genome.fna.gz</span> of <span class="font-mono">{{ sourceName(7) }}</span>
        becomes <span class="font-mono">{{ sourceName(7) }}/GCF_000005845.2/genome.fna.gz</span>.
        Each source bucket is one range of the bucket, so there are {{ BAKREP_COUNT }} ranges.
      </p>
      <label class="flex items-start gap-3 text-sm">
        <Switch :checked="dataset" aria-label="Create a collection dataset" @update:checked="dataset = $event" />
        <span>
          <span class="font-medium text-foreground">Create a collection dataset</span>
          <span class="block text-xs text-muted-foreground">
            One dataset describes the bucket and lists each source folder as a part. There is no dataset per file.
          </span>
        </span>
      </label>
      <div class="flex justify-end">
        <Button @click="started = true">Register {{ BAKREP_COUNT }} source buckets</Button>
      </div>
    </template>
    <template v-else>
      <Notice>
        Each node that writes a range lists its source buckets in pages and can continue after a restart.
        Only records are stored, no file bytes are copied.
      </Notice>
      <ImportProgress />
      <Notice v-if="dataset">The collection dataset is created when the last range is done.</Notice>
    </template>
  </div>
</template>
