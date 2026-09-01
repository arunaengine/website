<script setup lang="ts">
// The one way a surface points at the manual: a link to a docs section that
// exists. `section` names a section title and resolves to the anchor DocsView
// renders for it, so a moved heading breaks the link test instead of the page.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { BookOpen } from '@lucide/vue'
import { docsTopicBySlug, sectionId } from '@/docs/v1'

const props = withDefaults(defineProps<{ topic: string; section?: string; label?: string }>(), {
  section: undefined,
  label: undefined,
})

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
    :to="target"
    class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
  >
    <BookOpen class="size-3.5 shrink-0" aria-hidden="true" />
    <span>{{ text }}</span>
  </RouterLink>
</template>
