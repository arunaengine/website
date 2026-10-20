<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import LandingNav from '@/components/landing/LandingNav.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'

defineProps<{ title: string }>()

const route = useRoute()
const lang = computed(() => (route.query.lang === 'en' ? 'en' : 'de'))
const languages = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
] as const
</script>

<template>
  <div class="flex min-h-full flex-col">
    <LandingNav />
    <main class="flex-1 py-12 md:py-16">
      <div class="container max-w-3xl">
        <p class="eyebrow">Legal</p>
        <h1 class="mt-2 font-display text-3xl font-semibold tracking-tight text-aruna-navy md:text-4xl">
          {{ title }}
        </h1>
        <nav aria-label="Language" class="mt-8 flex gap-1 border-b border-border text-sm">
          <RouterLink
            v-for="item in languages"
            :key="item.id"
            :to="{ query: { ...route.query, lang: item.id } }"
            replace
            :lang="item.id"
            :aria-current="lang === item.id ? 'page' : undefined"
            class="-mb-px border-b-2 px-3 py-2 transition-colors"
            :class="lang === item.id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
          >
            {{ item.label }}
          </RouterLink>
        </nav>
        <article class="article-body mt-8" :lang="lang">
          <slot v-if="lang === 'de'" name="de" />
          <slot v-else name="en" />
        </article>
      </div>
    </main>
    <LandingFooter />
  </div>
</template>
