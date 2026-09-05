<script setup lang="ts">
// The same node at three sizes: a laptop, a lab server and a Kubernetes
// cluster all hold the same parts, so the picture says "run anywhere" and
// "one system" at once.
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import { Laptop, Server, Layers } from '@lucide/vue'

const PARTS = ['Storage', 'Metadata', 'Policy', 'Search', 'Compute']

const nodes = [
  { icon: Laptop, title: 'Laptop', tag: 'Local', line: 'A single binary. The whole node on one machine.' },
  { icon: Server, title: 'Lab server', tag: 'Institute', line: 'The same node in Docker, next to the instruments.' },
  { icon: Layers, title: 'Kubernetes cluster', tag: 'K8s', line: 'The same node at cluster scale. Same parts, same model.' },
]
</script>

<template>
  <section id="run-anywhere" class="band section relative overflow-hidden">
    <div
      aria-hidden="true"
      class="grid-faint pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_90%_100%_at_50%_60%,black_40%,transparent_100%)]"
    />
    <div class="container relative max-w-5xl">
      <div class="mx-auto max-w-2xl text-center">
        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Run anywhere</div>
        <h2 class="mt-3 text-balance font-display text-3xl font-semibold tracking-tight text-aruna-navy sm:text-4xl">
          One system, not a fleet of services.
        </h2>
        <p class="mt-3 text-sm text-muted-foreground">
          The one-stop shop for data management in heterogeneous, distributed environments: easy to use, maintain and build on. From a laptop to Kubernetes, the model stays the same.
        </p>
      </div>
      <div class="mt-12 grid gap-4 sm:grid-cols-3">
        <Card v-for="node in nodes" :key="node.title" class="landing-node flex flex-col gap-3 p-5">
          <div class="flex items-center justify-between">
            <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <component :is="node.icon" class="h-4 w-4" aria-hidden="true" />
            </div>
            <Badge size="sm" class="uppercase tracking-wide">{{ node.tag }}</Badge>
          </div>
          <h3 class="font-display text-base font-semibold text-aruna-navy">{{ node.title }}</h3>
          <p class="text-sm text-muted-foreground">{{ node.line }}</p>
          <div class="mt-auto flex flex-wrap gap-1.5 pt-1">
            <Badge v-for="part in PARTS" :key="part" :variant="part === 'Compute' ? 'accent' : 'default'" size="sm">
              {{ part }}
            </Badge>
          </div>
        </Card>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* The blueprint band: the hero's grid on a light blue sheet, so the three
   node cards sit on the same paper as the graphs. */
.band {
  background-image: linear-gradient(
    120deg,
    rgba(85, 196, 222, 0.14),
    rgba(51, 93, 198, 0.08) 55%,
    rgba(54, 62, 201, 0.12)
  );
}
.dark .band {
  background-image: linear-gradient(
    120deg,
    rgba(85, 196, 222, 0.1),
    rgba(78, 134, 215, 0.08) 55%,
    rgba(54, 62, 201, 0.18)
  );
}
</style>
