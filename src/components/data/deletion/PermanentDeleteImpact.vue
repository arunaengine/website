<script setup lang="ts">
// The red box of a permanent delete: what goes in Aruna, what goes in your storage, what stays.
import { ref } from 'vue'
import PagedList from '@/components/storage/PagedList.vue'
import Button from '@/components/ui/Button.vue'
import { useCursorPage } from '@/composables/useCursorPage'
import { getDeleteImpact, type ApiClientOptions, type DeleteImpact, type DeleteItem, type DeleteScope } from '@/lib/api'
import { filesWord } from '@/lib/organize'
import { formatBytes, formatNumber } from '@/lib/utils'

const props = defineProps<{ impact: DeleteImpact; label: string; scope: DeleteScope; client: ApiClientOptions }>()

const listed = ref(false)
// The first page came with the totals; later pages ask the node by cursor.
const list = useCursorPage<DeleteItem>(async (query) => {
  const page = await getDeleteImpact(props.scope, props.client, query)
  return { items: page.items, total: page.versions, complete: page.complete, next: page.next }
})

function toggle() {
  listed.value = !listed.value
  if (listed.value && !list.page.value) void list.load('')
}
</script>

<template>
  <div class="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3" data-testid="delete-impact">
    <p class="text-sm font-semibold text-destructive">Delete {{ label }} permanently</p>
    <p class="text-sm text-foreground">
      This deletes <b>{{ impact.complete ? '' : 'at least ' }}{{ filesWord(impact.files) }} with all {{ formatNumber(impact.versions) }} {{ impact.versions === 1 ? 'version' : 'versions' }}</b>
      in Aruna<template v-if="impact.storage_files">
        and {{ impact.complete ? 'up to' : 'at least' }} <b>{{ filesWord(impact.storage_files) }} ({{ formatBytes(impact.storage_bytes) }})</b> in your storage</template>.
    </p>
    <p v-if="!impact.storage_files" class="text-xs text-muted-foreground">No files are deleted in your storage.</p>
    <p v-if="impact.kept_files" class="text-xs text-muted-foreground">
      <template v-if="impact.complete && !impact.next">
        {{ filesWord(impact.kept_files) }} in your storage {{ impact.kept_files === 1 ? 'stays' : 'stay' }} because other links or files
        still use {{ impact.kept_files === 1 ? 'it' : 'them' }}.
      </template>
      <template v-else>Some storage files stay because other links or files still use them.</template>
    </p>
    <p class="text-xs font-medium text-destructive">This cannot be undone.</p>
    <Button v-if="impact.versions" variant="outline" size="sm" @click="toggle">{{ listed ? 'Hide files' : 'Show files' }}</Button>
    <PagedList
      v-if="listed"
      :total="list.page.value?.total ?? impact.versions"
      :complete="list.page.value?.complete ?? impact.complete"
      :offset="list.offset.value"
      :shown="list.items.value.length"
      :filter="list.filter.value"
      :busy="list.busy.value"
      :has-next="list.hasNext.value"
      :has-prev="list.hasPrev.value"
      @next="list.next()"
      @prev="list.prev()"
      @filter="(value: string) => list.load(value)"
    >
      <li v-for="item in list.items.value" :key="`${item.key}\n${item.version_id}`" class="space-y-0.5 px-3 py-1.5">
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate font-mono" :title="item.key">{{ item.key }}</span>
          <span class="shrink-0 tabular-nums text-muted-foreground">{{ formatBytes(item.bytes) }}</span>
        </div>
        <p v-if="item.storage_file" class="truncate font-mono text-[11px] text-muted-foreground" :title="item.storage_file.path">
          {{ item.storage_file.kept ? 'stays' : 'deleted' }} in your storage: {{ item.storage_file.path }}<template v-if="item.storage_file.kept"> ({{ item.storage_file.kept }})</template>
        </p>
      </li>
    </PagedList>
    <p v-if="list.error.value" class="text-xs text-destructive">{{ list.error.value }}</p>
  </div>
</template>
