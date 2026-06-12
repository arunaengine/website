<script setup lang="ts">
import {
  Boxes,
  FileJson2,
  KeyRound,
  Share2,
} from 'lucide-vue-next'

const features = [
  {
    title: 'Object storage',
    desc: 'Every node exposes an S3-compatible API, so existing clients, scripts and workflow tools keep working. Buckets can hold local objects and references to data on other nodes.',
    icon: Boxes,
    tone: 'bg-aruna-royal/15 text-aruna-royal dark:text-aruna-tagline',
  },
  {
    title: 'Metadata',
    desc: 'Datasets are described as RO-Crate JSON-LD documents covering files, people, licenses and processes. The same metadata is projected into a graph you can query with SPARQL.',
    icon: FileJson2,
    tone: 'bg-aruna-sky/15 text-aruna-sky',
  },
  {
    title: 'Replication',
    desc: 'Nodes in a realm exchange metadata documents peer to peer and converge again after a network partition. Data stays on the nodes of the organization that owns it.',
    icon: Share2,
    tone: 'bg-aruna-aqua/15 text-aruna-aqua',
  },
  {
    title: 'Access control',
    desc: 'You sign in through your institution\'s OIDC provider. Groups hold roles, and roles grant permissions scoped to paths, so access to every bucket and dataset is explicit.',
    icon: KeyRound,
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
          What every node provides.
        </h2>
        <p class="mt-3 text-sm text-muted-foreground">
          A node is a single binary that serves the S3 API, the REST API and
          this portal. These are the four parts you work with day to day.
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
