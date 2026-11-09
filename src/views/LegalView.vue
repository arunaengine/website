<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownIt from 'markdown-it'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import NotFoundView from '@/views/NotFoundView.vue'
import { portalConfig } from '@/lib/config'

// html:false escapes raw HTML in the source; markdown-it also rejects unsafe link protocols.
const markdown = new MarkdownIt({ html: false, linkify: true })

const route = useRoute()
const legal = computed(() => {
  const item = portalConfig().legal[Number(route.params.n)]
  return item && 'markdown' in item ? item : null
})
const html = computed(() => (legal.value ? markdown.render(legal.value.markdown) : ''))
</script>

<template>
  <NotFoundView v-if="!legal" />
  <div v-else>
    <PageHeader :title="legal.label" eyebrow="Legal" />
    <div class="w-full px-4 py-6 sm:px-6">
      <!-- eslint-disable-next-line vue/no-v-html -- markdown-it output, raw HTML disabled -->
      <article class="surface article-body p-6" v-html="html" />
    </div>
  </div>
</template>
