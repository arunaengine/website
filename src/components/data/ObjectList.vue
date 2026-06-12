<script setup lang="ts">
import type { S3Object } from '@/data/types'
import ObjectIcon from './ObjectIcon.vue'
import Pagination from '@/components/ui/Pagination.vue'
import { formatBytes, relativeTime } from '@/lib/utils'
import { Link2, HardDrive, Globe } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

const props = defineProps<{ objects: S3Object[]; selectedId?: string }>()
const emit = defineEmits<{
  (e: 'open', obj: S3Object): void
  (e: 'select', obj: S3Object): void
}>()

const PAGE_SIZE = 20
const page = ref(1)

watch(
  () => props.objects.length,
  () => {
    page.value = 1
  },
)

const paginated = computed(() =>
  props.objects.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)

function isReference(o: S3Object) {
  return o.kind === 'reference'
}

function sourceLabel(o: S3Object) {
  if (!isReference(o)) return ''
  if (o.sourceNode) {
    return o.sourceNode.startsWith('http')
      ? o.sourceNode
      : `node ${o.sourceNode.replace(/^node-/, '')}`
  }
  return 'remote'
}
</script>

<template>
  <div class="surface overflow-hidden">
    <table class="w-full text-sm">
      <thead class="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
        <tr>
          <th class="px-4 py-2 text-left font-semibold">Name</th>
          <th class="px-4 py-2 text-left font-semibold">Where</th>
          <th class="px-4 py-2 text-right font-semibold">Size</th>
          <th class="px-4 py-2 text-left font-semibold">Updated</th>
          <th class="px-4 py-2"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="o in paginated"
          :key="o.id"
          :class="[
            'cursor-pointer border-t border-border/50 transition-colors',
            props.selectedId === o.id
              ? 'bg-primary/10'
              : isReference(o)
                ? 'bg-amber-50/30 hover:bg-amber-50/50 dark:bg-amber-500/[0.04] dark:hover:bg-amber-500/[0.08]'
                : 'hover:bg-muted/40',
          ]"
          @click="emit('select', o)"
          @dblclick="o.kind === 'folder' ? emit('open', o) : null"
        >
          <td class="whitespace-nowrap px-4 py-2.5">
            <div class="flex items-center gap-2.5">
              <ObjectIcon :object="o" class="h-4 w-4" />
              <span
                class="truncate font-medium text-foreground/90"
                @click.stop="o.kind === 'folder' ? emit('open', o) : emit('select', o)"
              >
                {{ o.name }}
              </span>
              <span
                v-if="isReference(o)"
                class="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400"
                title="This file lives elsewhere — Aruna fetches it on demand."
              >
                <Link2 class="h-3 w-3" /> reference
              </span>
            </div>
          </td>
          <td class="px-4 py-2 text-[11px]">
            <span
              v-if="o.kind === 'folder'"
              class="text-muted-foreground/60"
            >—</span>
            <span
              v-else-if="isReference(o)"
              class="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"
            >
              <Globe class="h-3 w-3" />
              {{ sourceLabel(o) }}
            </span>
            <span v-else class="inline-flex items-center gap-1 text-muted-foreground">
              <HardDrive class="h-3 w-3" /> local
            </span>
          </td>
          <td class="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
            <span v-if="o.kind === 'folder'">—</span>
            <span v-else>{{ formatBytes(o.sizeBytes) }}</span>
          </td>
          <td class="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
            {{ relativeTime(o.updatedAt) }}
          </td>
          <td class="px-3 py-2 text-right">
            <button
              class="rounded px-2 py-1 text-[11px] text-aruna-royal hover:bg-aruna-royal/10"
              @click.stop="emit('select', o)"
            >
              Details
            </button>
          </td>
        </tr>
        <tr v-if="!objects.length">
          <td colspan="5" class="px-4 py-10 text-center text-sm text-muted-foreground">
            This folder is empty. Add data with the toolbar above.
          </td>
        </tr>
      </tbody>
    </table>
    <Pagination
      v-model:page="page"
      :page-size="PAGE_SIZE"
      :total="objects.length"
      label="files"
    />
  </div>
</template>
