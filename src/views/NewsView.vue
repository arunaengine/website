<script setup lang="ts">
import { RouterLink } from 'vue-router'
import LandingNav from '@/components/landing/LandingNav.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'
import { formatDate, newsPosts } from '@/lib/news/posts'

// The newest post gets the large card, older posts the grid below
const [latest, ...earlier] = newsPosts
</script>

<template>
  <div class="flex min-h-full flex-col">
    <LandingNav />
    <main class="flex-1 py-12 md:py-16">
      <div class="container max-w-6xl">
        <p class="eyebrow">News</p>
        <h1 class="mt-2 font-display text-3xl font-semibold tracking-tight text-aruna-navy md:text-4xl">
          News from the Aruna project
        </h1>
        <p class="mt-3 max-w-2xl text-muted-foreground">Releases, project updates and plans for Aruna.</p>
        <RouterLink
          v-if="latest"
          :to="{ name: 'news-post', params: { slug: latest.slug } }"
          class="surface group mt-10 grid overflow-hidden transition-colors hover:border-primary/40 lg:grid-cols-[1.25fr_1fr]"
        >
          <img
            :src="latest.image.src"
            :alt="latest.image.alt"
            :width="latest.image.width"
            :height="latest.image.height"
            fetchpriority="high"
            class="aspect-[16/10] h-full w-full border-b border-border object-cover lg:border-b-0 lg:border-r"
          />
          <div class="flex flex-col justify-center p-6 lg:p-8">
            <p class="text-xs text-muted-foreground">
              <time :datetime="latest.date">{{ formatDate(latest.date) }}</time> · {{ latest.author }}
            </p>
            <h2 class="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground group-hover:text-primary lg:text-3xl">
              {{ latest.title }}
            </h2>
            <p class="mt-3 leading-7 text-muted-foreground">{{ latest.teaser }}</p>
            <span class="mt-5 text-sm font-medium text-primary">Read the post</span>
          </div>
        </RouterLink>
        <ul class="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="post in earlier" :key="post.slug">
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
                <h2 class="mt-2 font-display text-lg font-semibold tracking-tight text-foreground group-hover:text-primary">
                  {{ post.title }}
                </h2>
                <p class="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{{ post.teaser }}</p>
                <span class="mt-auto pt-4 text-sm font-medium text-primary">Read the post</span>
              </div>
            </RouterLink>
          </li>
        </ul>
      </div>
    </main>
    <LandingFooter />
  </div>
</template>
