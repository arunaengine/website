<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import { ArrowRight, BookOpen } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="section bg-background">
    <div class="container max-w-5xl">
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-aruna-navy px-8 py-12 text-white shadow-sm sm:px-14"
      >
        <div
          class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(85,196,222,0.22),transparent_55%),radial-gradient(circle_at_90%_40%,rgba(54,62,201,0.28),transparent_55%)]"
        />
        <div class="relative grid items-end gap-8 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <div class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wider text-white/80">
              Get started
            </div>
            <h2
              class="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Bring your nodes. Keep your data. Share what you choose.
            </h2>
            <p class="mt-4 max-w-xl text-sm text-white/75 md:text-base">
              Spin up an Aruna node, join or create a realm, and every dataset
              you publish gets a stable identifier, a verifiable hash and
              replicas exactly where your policy requires them.
            </p>
          </div>
          <div class="flex flex-wrap gap-3 lg:justify-end">
            <RouterLink to="/app">
              <Button size="lg" variant="solid">
                Open the portal
                <ArrowRight class="h-4 w-4" />
              </Button>
            </RouterLink>
            <Button
              variant="outline"
              size="lg"
              class="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <BookOpen class="h-4 w-4" /> Read the spec
            </Button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
