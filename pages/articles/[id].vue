<script setup lang="ts">
import {IconChevronLeft} from '@tabler/icons-vue'
import type {v2Announcement} from "~/composables/aruna_api_json";

const route = useRoute()
const router = useRouter()
const articleId = route.params.id as string
// Loaded once on the server; the browser reuses the result instead of fetching again
const {data: announcement} = await useAsyncData<v2Announcement | undefined>(`article-${articleId}`, () => getAnnouncement(articleId))

// Show the preview image as a header unless the article already starts with an image
const headerImage = computed(() => {
  const content = announcement.value?.content || ''
  return announcement.value?.imageUrl && !/^\s*<p[^>]*>\s*<img/.test(content) ? announcement.value.imageUrl : ''
})

useSeoMeta({
  title: () => announcement.value?.title ? `${announcement.value.title} | Aruna` : 'Aruna news',
  description: () => announcement.value?.teaser || '',
  ogTitle: () => announcement.value?.title || 'Aruna news',
  ogDescription: () => announcement.value?.teaser || '',
  ogImage: () => announcement.value?.imageUrl || '',
  ogType: 'article',
})
</script>
<style>
code {
  counter-reset: step;
  counter-increment: step 0;
}

code .line::before {
  content: counter(step);
  counter-increment: step;
  width: 1rem;
  margin-right: 1.5rem;
  display: inline-block;
  text-align: right;
  color: rgba(110, 115, 141, 1) /*rgba(115,138,148,.4)*/
}
</style>
<template>
  <NavigationTop/>

  <!-- Blog Article -->
  <article class="container max-w-3xl py-12">
    <h1 class="sr-only">{{ announcement?.title }}</h1>
    <div class="mb-8 flex items-center justify-between gap-4 border-b border-border pb-6">
      <div class="flex items-center gap-3 text-sm text-muted-foreground">
        <img src="/imgs/aruna_icon.webp" alt="" class="size-9 rounded-full"/>
        <div>
          <div class="font-medium text-foreground">{{ announcement?.createdBy }}</div>
          <div class="flex items-center gap-2 text-xs">
            <time :datetime="announcement?.createdAt">{{ shortDate(announcement?.createdAt) }}</time>
            <template v-if="announcement?.modifiedAt && announcement?.modifiedAt !== announcement?.createdAt">
              <span aria-hidden="true">&middot;</span>
              <span>Updated {{ shortDate(announcement?.modifiedAt) }}</span>
            </template>
          </div>
        </div>
      </div>
      <button type="button"
              @click="router.back()"
              class="h-8 px-3 inline-flex items-center gap-x-2 text-sm font-medium rounded-md border border-input bg-transparent text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <IconChevronLeft class="size-3.5"/>
        Back
      </button>
    </div>

    <img v-if="headerImage"
         :src="headerImage"
         alt=""
         width="1586"
         height="992"
         fetchpriority="high"
         decoding="async"
         class="mb-8 h-auto w-full rounded-xl border border-border"/>

    <!-- Content -->
    <div v-html="announcement?.content" :key="announcement?.content" class="text-base"/>
  </article>
  <!-- End Blog Article -->

  <Footer/>
</template>