<script setup lang="ts">
import { IconChevronRight } from "@tabler/icons-vue";
</script>
<template>
  <div class="flex flex-grow pt-24">
    <!-- Hero -->
    <div class="max-w-[85rem] mx-auto mb-6 sm:px-6 lg:px-8">
      <!-- Grid -->
      <div class="grid md:grid-cols-2 gap-4 md:gap-8 xl:gap-20 md:items-center">
        <div>
          <h1 class="block font-bold text-gray-900 text-5xl dark:text-white">
            <p
              class="inline bg-gradient-to-r dark:hidden from-aruna-700 via-aruna-500 to-aruna-700 bg-clip-text font-display text-5xl tracking-tight text-transparent"
            >
              Orchestrate your data!
            </p>
            <p
              class="hidden dark:inline bg-gradient-to-r from-aruna-200 via-aruna-700 to-aruna-200 bg-clip-text font-display text-5xl tracking-tight text-transparent"
            >
              Orchestrate your data!
            </p>
          </h1>
          <p class="mt-4 text-lg text-gray-800 dark:text-gray-300">
            <strong> Fast, secure and domain-agnostic data management </strong>
            for heterogeneous souvereign data sources.
          </p>

          <!-- Buttons -->
          <div class="mt-7 grid gap-3 w-full sm:inline-flex">
            <a
              class="py-3 px-4 inline-flex justify-center items-center gap-x-2 text-sm font-semibold rounded-2xl border border-transparent bg-aruna-700 text-gray-300 hover:bg-aruna-600 disabled:opacity-50 disabled:pointer-events-none dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
              href="#"
            >
              Documentation

              <IconChevronRight class="icon" :size="16" />
            </a>
          </div>
          <!-- End Buttons -->

          <!-- Brands -->
          <div class="mt-6 lg:mt-12">
            <!-- <span class="text-xs font-medium text-gray-800 uppercase dark:text-gray-200">Sponsored by:</span> -->

            <div
              class="py-3 flex items-center text-sm text-gray-800 before:flex-[1_1_0%] before:border-t before:border-gray-400 before:me-6 after:flex-[1_1_0%] after:border-t after:border-gray-400 after:ms-6 dark:text-white dark:before:border-gray-600 dark:after:border-gray-600"
            >
              Supported by
            </div>

            <div class="mt-4 flex gap-x-8">
              <NuxtImg
                src="fair-ds-logo.png"
                class="w-40 object-bottom object-contain h-auto"
              />
              <NuxtImg
                src="microbiota.png"
                class="w-24 object-bottom object-contain h-auto"
              />
              <NuxtImg
                src="biodiv.png"
                class="w-40 object-bottom object-contain h-auto"
              />
              <NuxtImg
                src="denbi.svg"
                class="w-28 object-bottom object-contain h-auto"
              />
            </div>
            <!-- End Brands -->
          </div>
          <!-- End Review -->
        </div>
        <!-- End Col -->

        <div class="relative ms-4 p-4 rounded-3xl dark:border-aruna-800">
          <img
            class="w-full rounded-md dark:hidden"
            src="~/assets/imgs/hero_bright.gif"
            alt="Aruna Search Demo"
          />
          <img
            class="w-full rounded-md hidden dark:inline"
            src="~/assets/imgs/hero_dark.gif"
            alt="Aruna Search Demo"
          />
        </div>
        <!-- End Col -->
      </div>
      <!-- End Grid -->
    </div>
    <!-- End Hero -->
  </div>
</template>
