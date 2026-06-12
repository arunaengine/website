<script setup lang="ts">
import {
  Boxes,
  FileJson2,
  Search,
  ListChecks,
} from 'lucide-vue-next'

const features = [
  {
    title: 'Buckets',
    desc: 'A flat list of buckets — your files, organised the way you want them. Reference data from other endpoints when you need to.',
    icon: Boxes,
    tone: 'bg-aruna-royal/15 text-aruna-royal dark:text-aruna-tagline',
  },
  {
    title: 'Metadata',
    desc: 'RO-Crate descriptions for every dataset, with authors, license and rich context. Linked across the catalog.',
    icon: FileJson2,
    tone: 'bg-aruna-sky/15 text-aruna-sky',
  },
  {
    title: 'Profiles',
    desc: 'Schemas that describe what a "good" dataset looks like in your field. Pick a profile, fill in the form, you\'re done.',
    icon: ListChecks,
    tone: 'bg-aruna-aqua/15 text-aruna-aqua',
  },
  {
    title: 'Search',
    desc: 'A friendly search that returns datasets, buckets and files. Switch on expert mode for full SPARQL when you need it.',
    icon: Search,
    tone: 'bg-aruna-tagline/15 text-aruna-tagline',
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
          Four things, well done.
        </h2>
        <p class="mt-3 text-sm text-muted-foreground">
          Researchers shouldn't need to think about replication, gossip
          protocols or content hashes. Aruna keeps that out of the way.
        </p>
      </div>

      <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
