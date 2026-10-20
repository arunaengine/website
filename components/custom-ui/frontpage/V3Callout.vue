<script setup lang="ts">
import {IconArrowUpRight} from "@tabler/icons-vue";
</script>
<template>
  <section class="container mt-16 max-w-6xl">
    <div class="relative overflow-hidden rounded-xl border border-white/10 bg-aruna-navy px-8 py-12 text-white sm:px-14">
      <div aria-hidden="true"
           class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(85,196,222,0.22),transparent_55%),radial-gradient(circle_at_90%_40%,rgba(54,62,201,0.28),transparent_55%)]"/>
      <div class="relative grid items-end gap-8 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <div class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
            Aruna v3 &middot; Public testing
          </div>
          <h2 class="mt-4 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Federated data. Sovereign control.
          </h2>
          <p class="mt-4 max-w-xl text-sm text-white/75 md:text-base">
            The next version of Aruna is a federated, decentralized data management platform.
            Each organization runs its own node, keeps authority over its data and shares it with others.
            It is in public testing: try it out, but expect changes before the stable release.
          </p>
        </div>
        <div class="flex flex-wrap gap-3 lg:justify-end">
          <a href="https://v3.aruna-engine.org"
             target="_blank"
             rel="noopener"
             class="inline-flex h-11 items-center gap-2 rounded-md border border-white/25 px-6 text-sm font-medium text-white transition-colors hover:bg-white/10">
            Try the test version
            <IconArrowUpRight class="size-4"/>
          </a>
        </div>
      </div>
    </div>
  </section>
</template>
