<script setup lang="ts">
// A step running on a bucket, as a small label for the bucket lists.
import Spinner from '@/components/ui/Spinner.vue'
import type { BucketJob } from '@/lib/api'
import { bucketJobLabel } from '@/lib/organize'

defineProps<{ job: BucketJob }>()
</script>

<template>
  <span class="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground" data-testid="bucket-job">
    <Spinner v-if="job.state === 'running'" show-label :label="bucketJobLabel(job)" class="text-[11px]" />
    <template v-else>
      <span class="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
      {{ bucketJobLabel(job) }}
    </template>
  </span>
</template>
