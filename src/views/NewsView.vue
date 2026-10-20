<script setup lang="ts">
import { RouterLink } from 'vue-router'
import LandingNav from '@/components/landing/LandingNav.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'
import { formatDate, newsPosts } from '@/lib/news/posts'
</script>

<template>
  <div class="flex min-h-full flex-col">
    <LandingNav />
    <main class="flex-1 py-12 md:py-16">
      <div class="container max-w-5xl">
        <p class="eyebrow">News</p>
        <h1 class="mt-2 font-display text-3xl font-semibold tracking-tight text-aruna-navy md:text-4xl">
          News from the Aruna project
        </h1>
        <p class="mt-3 max-w-2xl text-muted-foreground">Releases, project updates and plans for Aruna.</p>
        <ul class="mt-10 grid gap-6 md:grid-cols-2">
          <li v-for="post in newsPosts" :key="post.slug">
            <RouterLink
              :to="{ name: 'news-post', params: { slug: post.slug } }"
              class="surface group flex h-full flex-col overflow-hidden transition-colors hover:border-primary/40"
            >
              <img
                :src="post.image.small"
                :alt="post.image.alt"
                width="800"
                height="500"
                loading="lazy"
                class="aspect-[16/10] w-full border-b border-border object-cover"
              />
              <div class="flex flex-1 flex-col p-5">
                <p class="text-xs text-muted-foreground">
                  <time :datetime="post.date">{{ formatDate(post.date) }}</time> · {{ post.author }}
                </p>
                <h2 class="mt-2 font-display text-xl font-semibold tracking-tight text-foreground group-hover:text-primary">
                  {{ post.title }}
                </h2>
                <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ post.teaser }}</p>
                <span class="mt-4 text-sm font-medium text-primary">Read the post</span>
              </div>
            </RouterLink>
          </li>
        </ul>
      </div>
    </main>
    <LandingFooter />
  </div>
</template>
