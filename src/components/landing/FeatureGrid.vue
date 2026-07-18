<script setup lang="ts">
import {
  Boxes,
  Cpu,
  FileJson2,
  KeyRound,
  Share2,
} from '@lucide/vue'

const features = [
  {
    title: 'Object storage',
    desc: 'An S3-compatible API on every node, with browsing and uploads built into this portal. Your clients, scripts and pipelines keep working, unchanged.',
    icon: Boxes,
    tone: 'bg-aruna-royal/15 text-aruna-royal dark:text-aruna-tagline',
  },
  {
    title: 'Metadata',
    desc: 'Every dataset is an RO-Crate: files, people, licenses, processes. Query the whole realm with SPARQL.',
    icon: FileJson2,
    tone: 'bg-aruna-sky/15 text-aruna-sky',
  },
  {
    title: 'Replication',
    desc: 'Metadata syncs peer to peer and converges after partitions. Data stays with the organization that owns it.',
    icon: Share2,
    tone: 'bg-aruna-aqua/15 text-aruna-aqua',
  },
  {
    title: 'Access control',
    desc: 'Sign in through your institution\'s OIDC provider. Roles grant permissions on paths, so every grant is explicit.',
    icon: KeyRound,
    tone: 'bg-aruna-tagline/15 text-aruna-tagline',
  },
  {
    title: 'Federated compute',
    desc: 'Submit GA4GH TES tasks from the portal — a quick-run wizard, workspace lifecycle choices, and tasks that run next to the data on any realm node.',
    icon: Cpu,
    tone: 'bg-aruna-indigo/15 text-aruna-indigo dark:text-aruna-tagline',
  },
]
</script>

<template>
  <section id="capabilities" class="section bg-background">
    <div class="container max-w-5xl">
      <div class="mx-auto max-w-2xl text-center">
        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          What's inside
        </div>
        <h2 class="mt-3 font-display text-3xl font-semibold tracking-tight text-aruna-navy sm:text-4xl">
          One binary, the whole node.
        </h2>
        <p class="mt-3 text-sm text-muted-foreground">
          Every node serves the S3 API, the REST API and this portal. These
          five parts do the daily work.
        </p>
      </div>

      <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="f in features"
          :key="f.title"
          class="surface flex h-full flex-col gap-3 p-5"
        >
          <div :class="['grid h-9 w-9 place-items-center rounded-lg', f.tone]">
            <component :is="f.icon" class="h-4 w-4" />
          </div>
          <h3 class="font-display text-base font-semibold text-aruna-navy">
            {{ f.title }}
          </h3>
          <p class="text-sm leading-relaxed text-muted-foreground">
            {{ f.desc }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
