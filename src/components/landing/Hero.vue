<script setup lang="ts">
import Button from "@/components/ui/Button.vue";
import { ArrowRight, BookOpen } from "@lucide/vue";
import { computed } from "vue";
import { useTheme } from "@/composables/useTheme";

const { isDark } = useTheme();
const wordmark = computed(() =>
  isDark.value ? "/brand/wordmark-white.png" : "/brand/wordmark.png",
);
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
    <div
      aria-hidden="true"
      class="wash-primary pointer-events-none absolute inset-0"
    />

    <div class="container relative max-w-3xl pb-24 pt-20 text-center sm:pt-24">
      <!-- Brand lockup: wave mark + ARUNA wordmark (always the image assets, never typed) -->
      <!-- icon-mark.png pads the wave; clip to its alpha bbox (183,333 to 1118,870 of 1254 sq) -->
      <div class="relative mx-auto aspect-[935/537] h-16 overflow-hidden sm:h-20">
        <img
          src="/brand/icon-mark.png"
          alt=""
          class="absolute left-[-19.6%] top-[-62%] w-[134.1%] max-w-none select-none"
          draggable="false"
        />
      </div>
      <img
        :src="wordmark"
        alt="ARUNA"
        class="mx-auto mt-3 h-8 w-auto select-none sm:h-10"
        draggable="false"
      />
      <p class="tagline mt-3.5 text-xs sm:text-[13px]">
        the data orchestration engine
      </p>

      <h1
        class="mt-12 font-display text-3xl font-semibold leading-[1.12] tracking-tight text-aruna-navy sm:text-4xl md:text-[42px]"
      >
        <span class="text-gradient">Your data</span> moves. Your control
        doesn't.
      </h1>

      <p class="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
        Aruna ships data and its metadata as one, across laptops, lab PCs and
        repositories. Wherever the data travels, you keep working in one place:
        the portal your own node serves.
      </p>

      <div class="mt-9 flex flex-wrap justify-center gap-3">
        <Button size="lg" as-child>
          <a href="#capabilities">
            See what's inside
            <ArrowRight class="h-4 w-4" />
          </a>
        </Button>
        <Button variant="outline" size="lg" as-child>
          <a href="#architecture">
            <BookOpen class="h-4 w-4" /> How it works
          </a>
        </Button>
      </div>

      <div class="mt-12 flex flex-wrap items-center justify-center gap-2.5">
        <div
          class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Open source, Apache 2.0 and MIT
        </div>
        <div
          class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground"
        >
          <span
            class="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary"
          >
            Upcoming
          </span>
          Compute next to your data
        </div>
      </div>
    </div>
  </section>
</template>
