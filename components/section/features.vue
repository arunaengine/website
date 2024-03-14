<script setup lang="ts">
import {
  IconDatabase,
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
  <div
    class="w-full max-w-[85rem] shadow-lg border-2 px-4 py-10 sm:px-6 lg:px-8 lg:py-14 mx-auto"
  >
    <div class="mx-auto">
      <!-- Grid -->
      <div class="grid md:grid-cols-2 gap-6 lg:gap-12">
        <div class="space-y-6 lg:space-y-10">
          <!-- Icon Block -->
          <div class="flex">
            <IconTournament
              class="m-auto w-14 h-auto flex-none text-gray-600 dark:text-gray-200"
            />
            <div class="ms-5 sm:ms-8">
              <h3
                class="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200"
              >
                Data orchestration
              </h3>
              <p class="mt-1 text-gray-600 dark:text-gray-300">
                The smart data orchestration engine manages data across multiple
                physical locations throughout the data lifecycle, including
                ingestion, transformation, analysis, and processing.
              </p>
            </div>
          </div>
          <!-- End Icon Block -->

          <!-- Icon Block -->
          <div class="flex">
            <IconFileInfo
              class="m-auto w-14 h-auto flex-none text-gray-600 dark:text-gray-200"
            />
            <div class="ms-5 sm:ms-8">
              <h3
                class="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200"
              >
                Metadata enrichment
              </h3>
              <p class="mt-1 text-gray-600 dark:text-gray-300">
                Enrich, group, and organize data and metadata, including
                qualified links to internal and external sources, thanks to a
                flexible and powerful multi-standard metadata management system.
              </p>
            </div>
          </div>
          <!-- End Icon Block -->

          <!-- Icon Block -->
          <div class="flex">
            <IconSearch
              class="m-auto w-14 h-auto flex-none text-gray-600 dark:text-gray-200"
            />
            <div class="ms-5 sm:ms-8">
              <h3
                class="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200"
              >
                FAIR
              </h3>
              <p class="mt-1 text-gray-600 dark:text-gray-300">
                All data is treated as FAIR Digital Object, with a globally
                unique persistent identifier for each resource and qualified
                (user-defined) relationships to internal and external sources.
              </p>
            </div>
          </div>
          <!-- End Icon Block -->
        </div>
        <!-- End Col -->

        <div class="space-y-6 lg:space-y-10">
          <!-- Icon Block -->
          <div class="flex">
            <IconShare
              class="m-auto w-14 h-auto flex-none text-gray-600 dark:text-gray-200"
            />
            <div class="ms-5 sm:ms-8">
              <h3
                class="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200"
              >
                Easy sharing
              </h3>
              <p class="mt-1 text-gray-600 dark:text-gray-300">
                Flexible data handling via the widely accepted S3 compatible
                interface, including pre-authenticated up- and download URLs
                makes it easy to integrate with existing tools and workflows.
              </p>
            </div>
          </div>
          <!-- End Icon Block -->

          <!-- Icon Block -->
          <div class="flex">
            <IconRocket
              class="m-auto w-14 h-auto flex-none text-gray-600 dark:text-gray-200"
            />
            <div class="ms-5 sm:ms-8">
              <h3
                class="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200"
              >
                Effortless migration
              </h3>
              <p class="mt-1 text-gray-600 dark:text-gray-300">
                Existing storage systems can be easily integrated into the
                system without moving any data. You maintain full control over
                who has access to your data
              </p>
            </div>
          </div>
          <!-- End Icon Block -->

          <!-- Icon Block -->
          <div class="flex">
            <IconShieldLock
              class="m-auto w-14 h-auto flex-none text-gray-600 dark:text-gray-200"
            />
            <div class="ms-5 sm:ms-8">
              <h3
                class="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200"
              >
                Secure
              </h3>
              <p class="mt-1 text-gray-600 dark:text-gray-300">
                By default all data is encrypted at REST. We are using the
                proven Crypt4GH encryption standard that is also used to secure
                sensitve medical data.
              </p>
            </div>
          </div>
          <!-- End Icon Block -->
        </div>
        <!-- End Col -->
      </div>
      <!-- End Grid -->
    </div>
  </div>
</template>
