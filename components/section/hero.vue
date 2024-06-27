<script setup lang="ts">
import {IconChevronRight} from "@tabler/icons-vue";
</script>
<template>
  <div class="flex flex-grow pt-4 md:pt-24">
    <!-- Hero -->
    <div class="container mx-auto sm:px-6 lg:px-8">
      <!-- Grid -->
      <div class="grid md:grid-cols-2 gap-4 md:gap-8 xl:gap-20 md:items-center">
        <div>
          <h1 class="inline font-bold text-5xl bg-gradient-to-r from-aruna-700 via-aruna-500 to-aruna-700 dark:from-aruna-200 dark:via-aruna-700 dark:to-aruna-200 bg-clip-text font-display tracking-tight text-transparent">
            Orchestrate your data!
          </h1>
          <p class="mt-4 text-lg text-gray-800 dark:text-gray-300">
            <strong>Fast, secure and domain-agnostic data management</strong> for heterogeneous sovereign data sources.
          </p>

          <!-- Buttons -->
          <div class="mt-7 grid gap-3 w-full sm:inline-flex">
            <a class="py-3 px-4 inline-flex justify-center items-center gap-x-2 text-sm font-semibold rounded-md border border-transparent bg-aruna-800 text-white hover:bg-aruna-700 disabled:opacity-50 disabled:pointer-events-none dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
               href="https://arunastorage.github.io/documentation/latest/get_started/basic_usage/01_Get-Storage-Access/"
               target="_blank">
              Get Started with Aruna
              <IconChevronRight class="icon" :size="16"/>
            </a>
          </div>
          <!-- End Buttons -->

          <!-- Brands -->
          <div class="mt-6 lg:mt-12">
            <div
                class="py-3 flex items-center text-sm text-gray-800 before:flex-[1_1_0%] before:border-t before:border-gray-400 before:me-6 after:flex-[1_1_0%] after:border-t after:border-gray-400 after:ms-6 dark:text-white dark:before:border-gray-600 dark:after:border-gray-600">
              Supported by
            </div>

            <div class="mt-4 flex gap-x-8 justify-center items-center">
              <div class="shrink">
                <img alt="Logo of the FAIR Data Spaces project"
                     src="assets/imgs/fair-ds-logo.png"
                     class="w-40 object-bottom object-contain h-auto"/>
              </div>
              <div class="shrink">
                <img alt="Logo of the NFDI4Microbiota project"
                     src="assets/imgs/microbiota.png"
                     class="w-24 object-bottom object-contain h-auto"/>
              </div>
              <div class="shrink">
                <img alt="Logo of the NFDI4Biodiversity project"
                     src="assets/imgs/biodiv.png"
                     class="w-40 object-bottom object-contain h-auto"/>
              </div>
              <div class="shrink">
                <img alt="Logo of the de.NBI project"
                     src="assets/imgs/denbi.svg"
                     class="w-28 object-bottom object-contain h-auto"/>
              </div>
            </div>
            <!-- End Brands -->
          </div>
          <!-- End Review -->
        </div>
        <!-- End Col -->

        <div class="relative ms-4 border-gray-300">
          <img class="w-full dark:hidden" src="~/assets/imgs/hero_bright.gif" alt="Aruna Search Demo"/>
          <img class="w-full hidden dark:inline" src="~/assets/imgs/hero_dark.gif" alt="Aruna Search Demo"/>
        </div>
        <!-- End Col -->
      </div>
      <!-- End Grid -->
    </div>
    <!-- End Hero -->
  </div>
</template>
