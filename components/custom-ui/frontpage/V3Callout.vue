<script setup lang="ts">
import {IconArrowUpRight, IconCheck} from "@tabler/icons-vue";
</script>
<template>
  <section class="section">
    <div class="container max-w-6xl">
      <div class="mx-auto max-w-2xl text-center">
        <div class="eyebrow">Two versions</div>
        <h2 class="section-title">From Aruna V2 to Aruna V3</h2>
        <p class="mt-3 text-sm text-muted-foreground">
          This site runs Aruna V2. Aruna V3 is a new system built from the ground up and is open for public testing.
        </p>
      </div>

      <div class="mt-12 grid gap-4 md:grid-cols-2">
        <div class="flex flex-col rounded-xl border border-border bg-card p-6 sm:p-8">
          <div class="flex items-center gap-2">
            <h3 class="font-display text-xl font-semibold text-foreground">Aruna V2</h3>
            <span class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">Stable</span>
          </div>
          <p class="mt-2 text-sm text-muted-foreground">The current service on this site. It will be replaced by Aruna V3 after a transition phase.</p>
          <ul class="mt-6 space-y-3 text-sm text-foreground/90">
            <li class="flex gap-2"><IconCheck class="mt-0.5 size-4 shrink-0 text-emerald-400"/>Projects, collections, datasets and objects</li>
            <li class="flex gap-2"><IconCheck class="mt-0.5 size-4 shrink-0 text-emerald-400"/>S3-compatible data proxies</li>
            <li class="flex gap-2"><IconCheck class="mt-0.5 size-4 shrink-0 text-emerald-400"/>Encryption at rest with Crypt4GH</li>
          </ul>
          <div class="mt-auto pt-8">
            <a href="https://docs.aruna-engine.org/latest"
               target="_blank"
               rel="noopener"
               class="inline-flex h-10 items-center gap-2 rounded-md border border-input px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent">
              Read the Aruna V2 docs
            </a>
          </div>
        </div>

        <div class="relative flex flex-col overflow-hidden rounded-xl border border-white/10 bg-aruna-navy p-6 text-white sm:p-8">
          <div aria-hidden="true"
               class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(85,196,222,0.22),transparent_55%),radial-gradient(circle_at_90%_90%,rgba(54,62,201,0.3),transparent_55%)]"/>
          <div class="relative flex items-center gap-2">
            <h3 class="font-display text-xl font-semibold">Aruna V3</h3>
            <span class="rounded-full border border-aruna-aqua/40 bg-aruna-aqua/15 px-2 py-0.5 text-[11px] font-medium text-aruna-aqua">Public testing</span>
          </div>
          <p class="relative mt-2 text-sm text-white/75">A FAIR, federated data orchestration engine.</p>
          <ul class="relative mt-6 space-y-3 text-sm text-white/90">
            <li class="flex gap-2"><IconCheck class="mt-0.5 size-4 shrink-0 text-aruna-aqua"/><span><strong class="font-semibold text-white">Data orchestration:</strong> jobs move to the data or data to the jobs, guided by placement policies</span></li>
            <li class="flex gap-2"><IconCheck class="mt-0.5 size-4 shrink-0 text-aruna-aqua"/><span><strong class="font-semibold text-white">Semantic metadata:</strong> linked data with RO-Crate, a provenance graph, SPARQL and SHACL profiles</span></li>
            <li class="flex gap-2"><IconCheck class="mt-0.5 size-4 shrink-0 text-aruna-aqua"/><span><strong class="font-semibold text-white">Data virtualization:</strong> buckets combine local files, copies and references to other nodes</span></li>
            <li class="flex gap-2"><IconCheck class="mt-0.5 size-4 shrink-0 text-aruna-aqua"/><span><strong class="font-semibold text-white">Federated:</strong> each organization runs its own node, with no central server</span></li>
          </ul>
          <p class="relative mt-6 text-xs text-white/60">Expect changes before the stable release.</p>
          <div class="relative mt-auto pt-6">
            <a href="https://v3.aruna-engine.org"
               target="_blank"
               rel="noopener"
               class="inline-flex h-10 items-center gap-2 rounded-md bg-white px-5 text-sm font-medium text-aruna-navy transition-colors hover:bg-white/90">
              Try the test version
              <IconArrowUpRight class="size-4"/>
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
