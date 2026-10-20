<script setup lang="ts">
import {IconArrowRight, IconArrowUpRight} from "@tabler/icons-vue";
</script>
<template>
  <section class="relative overflow-hidden border-b border-border bg-background">
    <div aria-hidden="true"
         class="grid-faint pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_0%,black_30%,transparent_75%)]"/>
    <div aria-hidden="true" class="wash-primary pointer-events-none absolute inset-0"/>

    <div class="relative mx-auto max-w-3xl px-4 pb-20 pt-16 text-center sm:pb-28 sm:pt-24">
      <a href="https://v3.aruna-engine.org"
         target="_blank"
         rel="noopener"
         class="inline-flex items-center gap-2 rounded-full border border-aruna-aqua/40 bg-aruna-aqua/10 px-3 py-1 text-xs font-medium text-aruna-aqua transition-colors hover:bg-aruna-aqua/20">
        <span class="size-1.5 rounded-full bg-aruna-aqua"/>
        Aruna V3 is in public testing
        <IconArrowUpRight class="size-3.5"/>
      </a>

      <!-- The icon asset keeps its transparent padding; clip it to the wave. -->
      <div class="relative mx-auto mt-10 aspect-[935/537] h-16 overflow-hidden sm:h-20">
        <img src="/brand/icon-mark.avif"
             alt=""
             class="absolute left-[-19.6%] top-[-62%] w-[134.1%] max-w-none select-none"
             draggable="false"/>
      </div>
      <img src="/brand/wordmark-white.avif"
           alt="ARUNA"
           class="mx-auto mt-3 h-8 w-auto select-none sm:h-10"
           draggable="false"/>
      <p class="tagline mt-3.5 text-xs sm:text-[13px]">the data orchestration engine</p>

      <h1 class="mt-10 text-balance font-display text-3xl font-semibold leading-[1.12] tracking-tight text-foreground sm:text-5xl md:text-[52px]">
        Orchestrate your data. <span class="text-gradient">Keep it sovereign.</span>
      </h1>

      <p class="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
        Fast, secure and domain-agnostic data orchestration for complex, sovereign data sources.
        Connect distributed datasets and stay compliant as you scale.
      </p>

      <div class="mt-9 flex flex-wrap justify-center gap-3">
        <a href="https://docs.aruna-engine.org/latest/get_started/basic_usage/01_Get-Storage-Access/"
           target="_blank"
           rel="noopener"
           class="inline-flex h-10 items-center gap-2 rounded-md bg-aruna-royal px-5 text-sm font-medium text-white transition-colors hover:bg-aruna-royal/90">
          Get started
          <IconArrowRight class="size-4"/>
        </a>
        <a href="#features"
           class="inline-flex h-10 items-center gap-2 rounded-md border border-input px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent">
          Learn more
        </a>
      </div>

      <div class="mt-12 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">
        <span class="size-1.5 rounded-full bg-emerald-500"/>
        Free and open source
      </div>
    </div>
  </section>
</template>
