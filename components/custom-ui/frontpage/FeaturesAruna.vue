<script lang="ts" setup>
import {
  IconFileInfo,
  IconRocket,
  IconSearch,
  IconShare,
  IconShieldLock,
  IconTournament,
} from "@tabler/icons-vue";
</script>
<template>
  <!-- Icon Blocks -->
  <div id="features"
       class="container mx-auto mt-16 2xl:mt-28 rounded-md border border-aruna-text/50 px-4 py-10 sm:px-6 lg:px-20 lg:py-14 bg-aruna-bg/90">
    <!-- Grid -->
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-12">
      <!-- Icon Block -->
      <div class="flex flex-col p-4 space-y-4">
        <h3 class="text-lg font-semibold text-aruna-text-accent">
          <IconTournament class="inline-flex flex-shrink-0 size-8 me-4 text-aruna-highlight"/>
          Data orchestration
        </h3>

        <p class="mt-1 text-aruna-text">
          The smart data orchestration engine manages data across multiple
          physical locations throughout the data lifecycle, including
          ingestion, transformation, analysis, and processing.
        </p>
      </div>
      <!-- End Icon Block -->

      <!-- Icon Block -->
      <div class="flex flex-col p-4 space-y-4">
        <h3 class="text-lg font-semibold text-aruna-text-accent">
          <IconFileInfo class="inline-flex flex-shrink-0 size-8 me-4 text-aruna-highlight"/>
          Metadata enrichment
        </h3>
        <p class="mt-1 text-aruna-text">
          Enrich, group, and organize data and metadata, including
          qualified links to internal and external sources, thanks to a
          flexible and powerful multi-standard metadata management system.
        </p>
      </div>
      <!-- End Icon Block -->

      <!-- Icon Block -->
      <div class="flex flex-col p-4 space-y-4">
        <h3 class="text-lg font-semibold text-aruna-text-accent">
          <IconSearch class="inline-flex flex-shrink-0 size-8 me-4 text-aruna-highlight"/>
          FAIR
        </h3>
        <p class="mt-1 text-aruna-text">
          All data is treated as FAIR Digital Object, with a globally
          unique persistent identifier for each resource and qualified
          (user-defined) relationships to internal and external sources.
        </p>
      </div>
      <!-- End Icon Block -->
      <!-- End Col -->

      <!-- Icon Block -->
      <div class="flex flex-col p-4 space-y-4">
        <h3 class="text-lg font-semibold text-aruna-text-accent">
          <IconShare class="inline-flex flex-shrink-0 size-8 me-4 text-aruna-highlight"/>
          Easy sharing
        </h3>
        <p class="mt-1 text-aruna-text">
          Flexible data handling via the widely accepted S3 compatible
          interface, including pre-authenticated up- and download URLs
          makes it easy to integrate with existing tools and workflows.
        </p>
      </div>
      <!-- End Icon Block -->

      <!-- Icon Block -->
      <div class="flex flex-col p-4 space-y-4">
        <h3 class="text-lg font-semibold text-aruna-text-accent">
          <IconRocket class="inline-flex flex-shrink-0 size-8 me-4 text-aruna-highlight"/>
          Effortless migration
        </h3>
        <p class="mt-1 text-aruna-text">
          Existing storage systems can be easily integrated into the
          system without moving any data. You maintain full control over
          who has access to your data
        </p>
      </div>
      <!-- End Icon Block -->

      <!-- Icon Block -->
      <div class="flex flex-col p-4 space-y-4">
        <h3 class="text-lg font-semibold text-aruna-text-accent">
          <IconShieldLock class="inline-flex flex-shrink-0 size-8 me-4 text-aruna-highlight"/>
          Secure
        </h3>
        <p class="mt-1 text-aruna-text">
          By default all data is encrypted at REST. We are using the
          proven Crypt4GH encryption standard that is also used to secure
          sensitive medical data.
        </p>
      </div>
      <!-- End Icon Block -->
    </div>
    <!-- End Grid -->
  </div>
</template>
