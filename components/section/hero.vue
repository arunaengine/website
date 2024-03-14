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
          <h1
            class="block font-bold text-gray-900 text-5xl lg:leading-tight dark:text-white"
          >
            <span class="text-aruna-800 dark:text-aruna-700"> Aruna, </span>
            the data orchestration engine
          </h1>
          <p class="mt-3 text-lg text-gray-800 dark:text-gray-300">
            <strong> Fast, secure and domain-agnostic data management </strong>
            for heterogeneous souvereign data sources.
          </p>

          <!-- Buttons -->
          <div class="mt-7 grid gap-3 w-full sm:inline-flex">
            <a
              class="py-3 px-4 inline-flex justify-center items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent bg-aruna-800 text-white hover:bg-aruna-700 disabled:opacity-50 disabled:pointer-events-none dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
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

        <div class="relative ms-4">
          <NuxtImg
            class="w-full rounded-md"
            src="hero_screen_dummy.png"
            alt="Image Description"
          />

          <!-- SVG-->
          <!-- 
                    <div class="absolute bottom-0 start-0">
                        <svg class="w-2/3 ms-auto h-auto text-arunaPrimary dark:text-slate-900" width="630" height="451"
                            viewBox="0 0 630 451" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="531" y="352" width="99" height="99" fill="currentColor" />
                            <rect x="140" y="352" width="106" height="99" fill="currentColor" />
                            <rect x="482" y="402" width="64" height="49" fill="currentColor" />
                            <rect x="433" y="402" width="63" height="49" fill="currentColor" />
                            <rect x="384" y="352" width="49" height="50" fill="currentColor" />
                            <rect x="531" y="328" width="50" height="50" fill="currentColor" />
                            <rect x="99" y="303" width="49" height="58" fill="currentColor" />
                            <rect x="99" y="352" width="49" height="50" fill="currentColor" />
                            <rect x="99" y="392" width="49" height="59" fill="currentColor" />
                            <rect x="44" y="402" width="66" height="49" fill="currentColor" />
                            <rect x="234" y="402" width="62" height="49" fill="currentColor" />
                            <rect x="334" y="303" width="50" height="49" fill="currentColor" />
                            <rect x="581" width="49" height="49" fill="currentColor" />
                            <rect x="581" width="49" height="64" fill="currentColor" />
                            <rect x="482" y="123" width="49" height="49" fill="currentColor" />
                            <rect x="507" y="124" width="49" height="24" fill="currentColor" />
                            <rect x="531" y="49" width="99" height="99" fill="currentColor" />
                        </svg>
                    </div>
                     -->
          <!-- End SVG-->
        </div>
        <!-- End Col -->
      </div>
      <!-- End Grid -->
    </div>
    <!-- End Hero -->
  </div>
</template>
