<script lang="ts" setup>
import {IconBook, IconAdjustmentsCog, IconBrandOpenSource, IconArrowRight} from "@tabler/icons-vue";

const links = [
  {
    title: 'Free and open-source',
    icon: IconBrandOpenSource,
    text: 'All components are freely available under a permissive open-source license.',
    href: 'https://github.com/arunaengine/aruna/tree/main?tab=readme-ov-file#license',
  },
  {
    title: 'Customizable',
    icon: IconAdjustmentsCog,
    text: 'Data proxy and server components are easily customizable to your needs.',
    href: 'https://github.com/arunaengine/aruna?tab=readme-ov-file#getting-started',
  },
  {
    title: 'Documentation',
    icon: IconBook,
    text: 'The comprehensive documentation makes getting started in Aruna a breeze.',
    href: 'https://docs.aruna-engine.org/latest',
  },
]
</script>
<template>
  <section class="section">
    <div class="container max-w-6xl">
      <div class="grid gap-4 md:grid-cols-3">
        <a v-for="l in links"
           :key="l.title"
           :href="l.href"
           target="_blank"
           rel="noopener"
           class="group flex gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-aruna-aqua/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <div class="grid size-9 shrink-0 place-items-center rounded-lg bg-aruna-aqua/10 text-aruna-aqua">
            <component :is="l.icon" class="size-5"/>
          </div>
          <div>
            <h3 class="flex items-center gap-1.5 font-display text-base font-semibold text-foreground">
              {{ l.title }}
              <IconArrowRight class="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-aruna-aqua"/>
            </h3>
            <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">{{ l.text }}</p>
          </div>
        </a>
      </div>
    </div>
  </section>
</template>
