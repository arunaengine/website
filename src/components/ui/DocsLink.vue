<script setup lang="ts">
// The one way a surface points at the manual: a link to a docs section that
// exists. `section` names a section title and resolves to the anchor DocsView
// renders for it, so a moved heading breaks the link test instead of the page.
// `icon` keeps the target and drops the label into aria-label and title.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { BookOpen } from '@lucide/vue'
import { docsTopicBySlug, sectionId } from '@/docs/v1'

const props = withDefaults(
  defineProps<{ topic: string; section?: string; label?: string; icon?: boolean }>(),
  { section: undefined, label: undefined, icon: false },
)

const subject = computed(() => props.section ?? docsTopicBySlug(props.topic)?.title ?? props.topic)
const text = computed(
  () => props.label ?? `Learn about ${subject.value.charAt(0).toLowerCase()}${subject.value.slice(1)}`,
)
const target = computed(() => ({
  name: 'docs',
  params: { topic: props.topic },
  ...(props.section ? { hash: `#${sectionId(props.section)}` } : {}),
}))
</script>

<template>
  <RouterLink
    v-if="icon"
    :to="target"
    :aria-label="text"
    :title="text"
    class="inline-flex shrink-0 rounded-sm align-middle text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <BookOpen class="size-3.5" aria-hidden="true" />
  </RouterLink>
  <RouterLink
    v-else
    :to="target"
    class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
  >
    <BookOpen class="size-3.5 shrink-0" aria-hidden="true" />
    <span>{{ text }}</span>
  </RouterLink>
</template>
