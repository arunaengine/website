<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft } from '@lucide/vue'
import LandingNav from '@/components/landing/LandingNav.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Button from '@/components/ui/Button.vue'
import { findPost, formatDate, renderPost } from '@/lib/news/posts'

const route = useRoute()
const post = computed(() => findPost(route.params.slug))
const html = computed(() => (post.value ? renderPost(post.value) : ''))
</script>

<template>
  <div class="flex min-h-full flex-col">
    <LandingNav />
    <main class="flex-1 py-12 md:py-16">
      <article v-if="post" class="container max-w-4xl">
        <RouterLink
          :to="{ name: 'news' }"
          class="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft class="h-4 w-4" /> All news
        </RouterLink>
        <header class="mx-auto mt-6 max-w-[68ch]">
          <p class="text-sm text-muted-foreground">
            <time :datetime="post.date">{{ formatDate(post.date) }}</time> · {{ post.author }}
          </p>
          <h1 class="mt-2 text-balance font-display text-3xl font-semibold tracking-tight text-aruna-navy md:text-4xl">
            {{ post.title }}
          </h1>
          <p class="mt-4 text-lg leading-8 text-muted-foreground">{{ post.teaser }}</p>
        </header>
        <img
          :src="post.image.src"
          :srcset="`${post.image.small} 800w, ${post.image.src} ${post.image.width}w`"
          sizes="(min-width: 896px) 832px, 100vw"
          :alt="post.image.alt"
          :width="post.image.width"
          :height="post.image.height"
          class="mt-10 aspect-[16/10] w-full rounded-lg border border-border object-cover"
        />
        <!-- eslint-disable-next-line vue/no-v-html -- markdown-it output, raw HTML disabled -->
        <div class="article-body mx-auto mt-10" v-html="html" />
      </article>
      <div v-else class="container max-w-xl">
        <EmptyState title="Post not found" description="This news post does not exist or has moved.">
          <Button variant="outline" as-child>
            <RouterLink :to="{ name: 'news' }"><ArrowLeft class="h-4 w-4" /> All news</RouterLink>
          </Button>
        </EmptyState>
      </div>
    </main>
    <LandingFooter />
  </div>
</template>
