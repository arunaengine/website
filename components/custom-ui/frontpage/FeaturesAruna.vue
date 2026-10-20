<script lang="ts" setup>
import {
  IconFileInfo,
  IconRocket,
  IconSearch,
  IconShare,
  IconShieldLock,
  IconTournament,
} from "@tabler/icons-vue";

const features = [
  {
    title: 'Data orchestration',
    icon: IconTournament,
    text: 'The smart data orchestration engine manages data across multiple physical locations throughout the data lifecycle, including ingestion, transformation, analysis, and processing.',
  },
  {
    title: 'Metadata enrichment',
    icon: IconFileInfo,
    text: 'Enrich, group, and organize data and metadata, including qualified links to internal and external sources, thanks to a flexible and powerful multi-standard metadata management system.',
  },
  {
    title: 'FAIR',
    icon: IconSearch,
    text: 'All data is treated as FAIR Digital Object, with a globally unique persistent identifier for each resource and qualified (user-defined) relationships to internal and external sources.',
  },
  {
    title: 'Easy sharing',
    icon: IconShare,
    text: 'Flexible data handling via the widely accepted S3 compatible interface, including pre-authenticated up- and download URLs makes it easy to integrate with existing tools and workflows.',
  },
  {
    title: 'Effortless migration',
    icon: IconRocket,
    text: 'Existing storage systems can be easily integrated into the system without moving any data. You maintain full control over who has access to your data.',
  },
  {
    title: 'Secure',
    icon: IconShieldLock,
    text: 'By default all data is encrypted at rest. We are using the proven Crypt4GH encryption standard that is also used to secure sensitive medical data.',
  },
]
</script>
<template>
  <section id="features" class="section">
    <div class="container max-w-6xl">
      <div class="mx-auto max-w-2xl text-center">
        <div class="eyebrow">Features</div>
        <h2 class="section-title">One engine for your data lifecycle.</h2>
      </div>

      <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="f in features"
             :key="f.title"
             class="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <div class="grid size-9 place-items-center rounded-lg bg-aruna-aqua/10 text-aruna-aqua">
            <component :is="f.icon" class="size-5"/>
          </div>
          <h3 class="font-display text-base font-semibold text-foreground">{{ f.title }}</h3>
          <p class="text-sm leading-relaxed text-muted-foreground">{{ f.text }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
