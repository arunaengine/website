<script setup lang="ts">
// Mock of registering an external collection: 49 public S3 buckets become one distributed bucket.
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import ImportProgress from '@/components/distributed/ImportProgress.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import Button from '@/components/ui/Button.vue'
import DetailList from '@/components/ui/DetailList.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Switch from '@/components/ui/Switch.vue'
import { BAKREP_COUNT, BAKREP_ENDPOINT, sourceName } from '@/lib/distributedMockData'
import { MOCK_BASE } from '@/router/distributedMock'

const name = ref('bakrep')
const dataset = ref(true)
const started = ref(false)
</script>

<template>
  <div>
    <PageHeader
      :docs="{ topic: 'where-data-lives', section: 'Buckets' }"
      title="Register an external collection"
      description="List the files of public S3 buckets once. Browsing and file name search then need no request to the source."
    >
      <template #breadcrumbs>
        <span>·</span>
        <RouterLink :to="MOCK_BASE" class="hover:underline">Distributed buckets</RouterLink>
      </template>
    </PageHeader>

    <div class="container space-y-5 py-6">
      <MockNotice />

      <template v-if="!started">
        <section class="surface space-y-3 p-5">
          <h2 class="font-display text-base font-semibold text-aruna-navy">Source</h2>
          <DetailList
            :items="[
              { label: 'Endpoint', value: BAKREP_ENDPOINT, mono: true },
              { label: 'Access', value: 'Public, no credentials' },
              { label: 'Source buckets', value: `${BAKREP_COUNT}: ${sourceName(0)} to ${sourceName(BAKREP_COUNT - 1)}` },
              { label: 'Files', value: 'About 50 million' },
            ]"
          />
        </section>

        <section class="surface space-y-3 p-5">
          <h2 class="font-display text-base font-semibold text-aruna-navy">Distributed bucket</h2>
          <Input v-model="name" class="max-w-sm font-mono text-xs" aria-label="Bucket name" />
          <p class="text-xs text-muted-foreground">
            Keys are prefixed with the name of the source bucket, so the file
            <span class="font-mono">GCF_000005845.2/genome.fna.gz</span> of <span class="font-mono">{{ sourceName(7) }}</span>
            is the key <span class="font-mono">{{ sourceName(7) }}/GCF_000005845.2/genome.fna.gz</span>.
          </p>
          <p class="text-xs text-muted-foreground">
            There is one range per source bucket, so {{ BAKREP_COUNT }} ranges. Nodes node-1, node-2 and node-3 take turns
            as coordinators, each range has a copy in the other location, and node-5 caches files that are read. Create the members and settings
            on <RouterLink :to="`${MOCK_BASE}/new`" class="underline">New distributed bucket</RouterLink>.
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
        </section>

        <div class="flex justify-end">
          <Button @click="started = true">Register {{ BAKREP_COUNT }} source buckets</Button>
        </div>
      </template>

      <section v-else class="surface space-y-3 p-5">
        <h2 class="font-display text-base font-semibold text-aruna-navy">Registering {{ name }}</h2>
        <Notice>
          Each coordinator lists its source buckets in pages and can continue after a restart.
          Only records are stored, no file bytes are copied. The data stays at the source until a file is read.
        </Notice>
        <ImportProgress />
        <Notice v-if="dataset" tone="info">The collection dataset is created when the last range is done.</Notice>
      </section>
    </div>
  </div>
</template>
