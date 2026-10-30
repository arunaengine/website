<script setup lang="ts">
// Names of one group in three columns, each opening its entity, with a search for other datasets.
// A group over ten names gets a filter and the Data-style pager.
import { computed, ref, type Component } from 'vue'
import { RouterLink } from 'vue-router'
import Input from '@/components/ui/Input.vue'
import ListPager from '@/components/ui/ListPager.vue'
import { usePagedList } from '@/composables/usePagedList'
import { Search } from '@lucide/vue'

const props = defineProps<{ items: Array<{ id: string; name: string; icon: Component }>; noun: string }>()
const emit = defineEmits<{ (e: 'open', id: string): void }>()

const filter = ref('')
const matching = computed(() => {
  const words = filter.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return props.items.filter((item) => words.every((word) => item.name.toLowerCase().includes(word)))
})
const { page, pageSize, shown, total, paged } = usePagedList(matching)
</script>

<template>
  <div class="min-w-0 space-y-2">
    <div v-if="items.length > 10" class="relative max-w-xs">
      <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input v-model="filter" class="h-8 pl-8 text-xs" :placeholder="`Filter ${items.length} ${noun}`" :aria-label="`Filter ${noun}`" />
    </div>
    <ul class="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="item in shown" :key="item.id" class="flex min-w-0 items-center gap-2 text-sm">
        <component :is="item.icon" class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <button type="button" class="min-w-0 truncate text-left underline decoration-border underline-offset-4 hover:decoration-foreground" :title="item.name" @click="emit('open', item.id)">{{ item.name }}</button>
        <RouterLink :to="{ name: 'datasets', query: { q: item.name } }" class="shrink-0 text-muted-foreground hover:text-foreground" :aria-label="`Search datasets with ${item.name}`" :title="`Search datasets with ${item.name}`">
          <Search class="h-3.5 w-3.5" aria-hidden="true" />
        </RouterLink>
      </li>
    </ul>
    <p v-if="!shown.length" class="text-xs text-muted-foreground">No {{ noun }} match.</p>
    <ListPager v-if="paged" v-model:page="page" v-model:page-size="pageSize" :total="total" class="border-t border-border-subtle" />
  </div>
</template>
