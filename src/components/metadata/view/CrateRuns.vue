<script setup lang="ts">
// The runs (actions) a crate records, one row each in start order; a run opens its entity.
import { computed } from 'vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import ListPager from '@/components/ui/ListPager.vue'
import { usePagedList } from '@/composables/usePagedList'
import { crateActions } from '@/lib/crateType'
import { actionDuration } from '@/lib/datasetFacts'
import { stringProp } from '@/lib/dataEntities'
import { readableIri } from '@/lib/identifiers'
import { formatDateTime } from '@/lib/utils'
import { Play } from '@lucide/vue'

// `skip`: the run the page already shows in full.
const props = defineProps<{ crate: unknown; skip?: string; title: string }>()
const emit = defineEmits<{ (e: 'open', id: string): void }>()

const STATUS: Record<string, string> = {
  CompletedActionStatus: 'Completed',
  FailedActionStatus: 'Failed',
  ActiveActionStatus: 'Running',
  PotentialActionStatus: 'Not started',
}
const rows = computed(() =>
  crateActions(props.crate)
    .filter((action) => action['@id'] !== props.skip)
    .map((action) => {
      const id = String(action['@id'])
      const start = stringProp(action.startTime) ?? ''
      return {
        id,
        name: stringProp(action.name) || readableIri(id),
        status: STATUS[(stringProp(action.actionStatus) ?? '').replace(/^.*[/#:]/, '')] ?? '',
        start,
        started: start ? formatDateTime(start) : '',
        duration: actionDuration(action),
      }
    })
    .sort((a, b) => (a.start || '￿').localeCompare(b.start || '￿')),
)
const { page, pageSize, shown, total, paged } = usePagedList(rows)
</script>

<template>
  <section v-if="rows.length" aria-labelledby="runs-heading">
    <SectionHeading id="runs-heading" :title="title" :icon="Play" :count="String(rows.length)" />
    <div class="surface overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-border text-xs text-muted-foreground">
          <tr>
            <th class="px-4 py-2 font-medium">Run</th>
            <th class="px-4 py-2 font-medium">Status</th>
            <th class="px-4 py-2 font-medium">Started</th>
            <th class="px-4 py-2 font-medium">Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in shown" :key="row.id" class="border-b border-border-subtle last:border-0">
            <td class="max-w-0 px-4 py-2">
              <button type="button" class="max-w-full truncate text-left underline decoration-border underline-offset-4 hover:decoration-foreground" :title="row.name" @click="emit('open', row.id)">{{ row.name }}</button>
            </td>
            <td class="whitespace-nowrap px-4 py-2" :class="row.status === 'Failed' ? 'text-status-failed' : ''">{{ row.status || '-' }}</td>
            <td class="whitespace-nowrap px-4 py-2 tabular-nums">{{ row.started || '-' }}</td>
            <td class="whitespace-nowrap px-4 py-2 tabular-nums">{{ row.duration || '-' }}</td>
          </tr>
        </tbody>
      </table>
      <ListPager v-if="paged" v-model:page="page" v-model:page-size="pageSize" :total="total" class="border-t border-border-subtle" />
    </div>
  </section>
</template>
