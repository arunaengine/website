<script setup lang="ts">
// Run records as table rows: the run's state, title, tool and last change, then its group, results
// and license. What the browse summary does not say stays out; nothing is guessed.
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import StatusMark from '@/components/ui/StatusMark.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import type { MetadataDoc } from '@/data/types'
import { licenseLabelOf } from '@/lib/licenses'
import { parseRunCrate, runState } from '@/lib/runCrate'
import { relativeTime } from '@/lib/utils'
import { ChevronRight, Clock, Container, Users } from '@lucide/vue'

const props = defineProps<{ docs: MetadataDoc[]; groupNames: ReadonlyMap<string, string> }>()
const router = useRouter()

const rows = computed(() =>
  props.docs.map((doc) => {
    const run = parseRunCrate(doc.roCrate, '')
    const outputs = run?.outputs.length || doc.linkedObjects.length
    return {
      doc,
      state: run ? runState(run) : null,
      tool: run?.instrument?.name || run?.container?.name || '',
      results: outputs ? `${outputs} ${outputs === 1 ? 'file' : 'files'}` : '',
    }
  }),
)
const open = (doc: MetadataDoc) => router.push({ name: 'dataset', params: { id: doc.ulid } })
</script>

<template>
  <div class="overflow-x-auto">
    <table class="data-table data-table-tall">
      <thead>
        <tr>
          <th class="pl-5">Record</th>
          <th class="hidden md:table-cell">Group</th>
          <th class="hidden sm:table-cell">Results</th>
          <th class="hidden lg:table-cell">License</th>
          <th class="pr-4"><span class="sr-only">Open</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.doc.ulid" class="cursor-pointer" @click="open(row.doc)">
          <td class="w-full max-w-0 pl-5">
            <span class="flex items-start gap-3">
              <span class="mt-0.5 flex w-4 shrink-0 justify-center">
                <StatusMark v-if="row.state === 'succeeded'" label="Completed" />
                <StatusPill v-else-if="row.state" :state="row.state" class="-ml-1" />
              </span>
              <span class="min-w-0">
                <RouterLink :to="{ name: 'dataset', params: { id: row.doc.ulid } }" class="line-clamp-2 break-words font-medium text-foreground hover:underline" @click.stop>{{ row.doc.title }}</RouterLink>
                <span class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span v-if="row.tool" class="inline-flex items-center gap-1"><Container class="h-3.5 w-3.5" aria-hidden="true" />{{ row.tool }}</span>
                  <span v-if="row.doc.updatedAt" class="inline-flex items-center gap-1" :title="row.doc.updatedAt"><Clock class="h-3.5 w-3.5" aria-hidden="true" />Updated {{ relativeTime(row.doc.updatedAt) }}</span>
                </span>
              </span>
            </span>
          </td>
          <td class="hidden whitespace-nowrap text-[13px] md:table-cell">
            <RouterLink v-if="row.doc.realmId" :to="{ name: 'group', params: { id: row.doc.realmId } }" class="inline-flex items-center gap-1.5 hover:underline" @click.stop>
              <Users class="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{{ groupNames.get(row.doc.realmId) ?? row.doc.realmId }}
            </RouterLink>
          </td>
          <td class="hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground sm:table-cell">{{ row.results }}</td>
          <td class="hidden max-w-[12rem] truncate text-xs text-muted-foreground lg:table-cell" :title="row.doc.license">{{ row.doc.license ? licenseLabelOf(row.doc.license) : '' }}</td>
          <td class="w-10 pr-4 text-right"><ChevronRight class="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" /></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
