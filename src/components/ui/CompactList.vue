<script setup lang="ts">
// A long preflight list stays one line until it is asked for: a count that
// expands into a filtered list, one page of entries at a time.
import { computed, ref, watch } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import Input from '@/components/ui/Input.vue'
import { ChevronDown } from '@lucide/vue'

interface CompactListItem {
  key: string
  text: string
  /** Second line of the entry, such as the content a reference belongs to. */
  detail?: string
  /** Where the entry links, when it links anywhere. */
  to?: RouteLocationRaw
}

const PAGE = 25

const props = defineProps<{
  /** Singular noun for the count line; the plural adds an s. */
  label: string
  items: readonly CompactListItem[]
}>()

const expanded = ref(false)
const query = ref('')
const shown = ref(PAGE)

const plural = computed(() => `${props.label}s`)
const countLabel = computed(
  () => `${props.items.length} ${props.items.length === 1 ? props.label : plural.value}`,
)
// The filter runs over every entry, not only the page on screen.
const matches = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return props.items
  return props.items.filter((item) =>
    `${item.text} ${item.detail ?? ''}`.toLowerCase().includes(needle),
  )
})
const page = computed(() => matches.value.slice(0, shown.value))
const hidden = computed(() => matches.value.length - page.value.length)

watch([query, () => props.items], () => (shown.value = PAGE))

function showMore() {
  shown.value += PAGE
}
</script>

<template>
  <div class="space-y-1">
    <button
      type="button"
      class="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
      :aria-expanded="expanded"
      :aria-label="`${expanded ? 'Hide' : 'Show'} the ${countLabel}`"
      @click="expanded = !expanded"
    >
      <ChevronDown class="h-3 w-3 transition-transform" :class="expanded ? 'rotate-180' : ''" />
      {{ countLabel }}
    </button>

    <template v-if="expanded">
      <Input
        v-model="query"
        class="h-7 max-w-xs text-xs"
        :placeholder="`Filter ${plural}…`"
        :aria-label="`Filter ${plural}`"
      />
      <p v-if="!matches.length" class="text-muted-foreground">No {{ plural }} match this filter.</p>
      <ul v-else class="space-y-1 pl-4">
        <li v-for="item in page" :key="item.key" class="list-disc break-all">
          <RouterLink
            v-if="item.to"
            :to="item.to"
            class="font-medium text-primary hover:underline"
          >{{ item.text }}</RouterLink>
          <span v-else>{{ item.text }}</span>
          <span v-if="item.detail" class="ml-1 font-mono text-[10px] text-muted-foreground">{{ item.detail }}</span>
        </li>
      </ul>
      <p v-if="hidden > 0" class="flex items-center gap-2 text-muted-foreground">
        <button
          type="button"
          class="font-medium text-primary underline-offset-2 hover:underline"
          @click="showMore"
        >Show more</button>
        <span>{{ hidden }} more</span>
      </p>
    </template>
  </div>
</template>
