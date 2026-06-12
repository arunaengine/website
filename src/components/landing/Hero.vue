<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import { ArrowRight, BookOpen } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import { computed } from 'vue'
import { useTheme } from '@/composables/useTheme'

const { isDark } = useTheme()
const wordmark = computed(() =>
  isDark.value ? '/brand/wordmark-white.png' : '/brand/wordmark.png',
)
</script>

<template>
  <section
    id="overview"
    class="relative overflow-hidden border-b border-border bg-background"
  >
    <div
      aria-hidden="true"
      class="grid-faint pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_0%,black_30%,transparent_75%)]"
    />
    <div aria-hidden="true" class="wash-primary pointer-events-none absolute inset-0" />

    <div class="container relative max-w-3xl pb-24 pt-20 text-center sm:pt-24">
      <!-- Brand lockup: wave mark + ARUNA wordmark (image — never typed) -->
      <img
        src="/brand/icon-mark.png"
        alt=""
        class="mx-auto h-16 w-16 select-none sm:h-20 sm:w-20"
        draggable="false"
      />
      <img
        :src="wordmark"
        alt="ARUNA"
        class="mx-auto mt-6 h-8 w-auto select-none sm:h-10"
        draggable="false"
      />
      <p class="tagline mt-3.5 text-xs sm:text-[13px]">
        the data orchestration engine
      </p>

      <h1
        class="mt-12 font-display text-3xl font-semibold leading-[1.12] tracking-tight text-aruna-navy sm:text-4xl md:text-[42px]"
      >
        One place for your
        <span class="text-gradient">research data</span>
        and the metadata that describes it.
      </h1>

      <p class="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
        Buckets for files. Profiles for metadata. A search that finds both. No
        node management, no replication knobs — Aruna takes care of the
        plumbing.
      </p>

      <div class="mt-9 flex flex-wrap justify-center gap-3">
        <RouterLink to="/app">
          <Button size="lg">
            Open the portal
            <ArrowRight class="h-4 w-4" />
          </Button>
        </RouterLink>
        <Button variant="outline" size="lg" as-child>
          <a href="#capabilities">
            <BookOpen class="h-4 w-4" /> What's inside
          </a>
        </Button>
      </div>

      <div
        class="mt-12 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Federated research data, made simple
      </div>
    </div>
  </section>
</template>
