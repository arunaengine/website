<script setup lang="ts">
import {
  Boxes,
  Cpu,
  FileJson2,
  Globe,
  KeyRound,
  MessageSquare,
  Share2,
} from '@lucide/vue'
import type { FunctionalComponent } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'

interface Feature {
  title: string
  desc: string
  icon: FunctionalComponent
  tone: string
  /** Blue preview treatment: announced, not shipped yet. */
  upcoming?: boolean
}

const features: Feature[] = [
  {
    title: 'Object storage',
    desc: 'An S3-compatible API on every node, with browsing and uploads built into this portal. Your clients, scripts and pipelines keep working, unchanged.',
    icon: Boxes,
    tone: 'bg-aruna-royal/15 text-aruna-royal dark:text-aruna-tagline',
  },
  {
    title: 'Datasets',
    desc: 'Every dataset describes its files, contributors, licenses and processes as linked data, and imports and exports as RO-Crate. Query the whole realm with SPARQL.',
    icon: FileJson2,
    tone: 'bg-aruna-sky/15 text-aruna-sky',
  },
  {
    title: 'Replication',
    desc: 'Datasets sync directly between nodes and converge after partitions. Data stays with the organization that owns it.',
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
    title: 'Realm compute',
    desc: 'Run scripts and container jobs on the node that already holds the data. Start them from the portal, choose how long the workspace lives, and results land back in your buckets.',
    icon: Cpu,
    tone: 'bg-aruna-indigo/15 text-aruna-indigo dark:text-aruna-tagline',
  },
  {
    title: 'Assistant',
    desc: 'Bring your own AI provider or key and chat in the portal. The assistant drives the node\'s own tools over MCP to search, read and draft datasets, and the key stays in your browser.',
    icon: MessageSquare,
    tone: 'bg-gradient-to-br from-aruna-sky to-aruna-indigo text-white shadow-sm',
  },
  {
    title: 'Realm federation',
    desc: 'A realm is self-contained today. Federation will connect realms to one another, so data and metadata can be discovered and shared across organizational borders.',
    icon: Globe,
    tone: 'bg-primary/10 text-primary',
    upcoming: true,
  },
]
</script>

<template>
  <section id="capabilities" class="section">
    <div class="container max-w-5xl">
      <div class="mx-auto max-w-2xl text-center">
        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          What's inside
        </div>
        <h2 class="mt-3 text-balance font-display text-3xl font-semibold tracking-tight text-aruna-navy sm:text-4xl">
          One binary, the whole node.
        </h2>
        <p class="mt-3 text-sm text-muted-foreground">
          Every node serves the S3 API, the REST API and this portal. These
          parts do the daily work.
        </p>
      </div>

      <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          v-for="f in features"
          :key="f.title"
          class="flex h-full flex-col gap-3 p-5"
          :class="f.upcoming ? 'border-primary/30 bg-primary/[0.03] lg:col-span-3 lg:flex-row lg:items-center lg:gap-5' : ''"
        >
          <div :class="['grid h-9 w-9 shrink-0 place-items-center rounded-lg', f.tone]">
            <component :is="f.icon" class="h-4 w-4" />
          </div>
          <div class="flex flex-col gap-3" :class="f.upcoming ? 'lg:gap-1' : ''">
            <h3 class="font-display text-base font-semibold text-aruna-navy">
              {{ f.title }}
            </h3>
            <p class="text-sm leading-relaxed text-muted-foreground">
              {{ f.desc }}
            </p>
          </div>
          <Badge v-if="f.upcoming" size="sm" class="uppercase tracking-wide lg:ml-auto lg:self-start">Upcoming</Badge>
        </Card>
      </div>
    </div>
  </section>
</template>
