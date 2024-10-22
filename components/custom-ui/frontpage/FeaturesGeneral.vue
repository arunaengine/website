<script setup lang="ts">
import {IconAdjustmentsCog, IconBrandOpenSource, IconChevronRight} from "@tabler/icons-vue";
</script>
<template>
  <div class="container mt-12 rounded-md px-4 py-6 sm:px-6 lg:px-8 mx-auto bg-[#080d1f]/[.6]">
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 items-center gap-2">

      <!-- Icon Block -->
      <NuxtLink to="https://github.com/ArunaStorage/aruna/tree/main?tab=readme-ov-file#license"
                target="_blank"
                class="group flex flex-col justify-center rounded-md p-4 md:p-7 transition-all ease-in-out delay-50 duration-500 focus:scale-105 hover:scale-105 hover:bg-aruna-700/[.15] focus:outline-none focus:ring-2 focus:ring-aruna-700">
        <div class="flex justify-center items-center mx-auto size-12 bg-aruna-800 rounded-md">
          <IconBrandOpenSource class="flex-shrink-0 size-6 text-white"/>
        </div>
        <div class="mt-5 text-center">
          <h3 class="text-xl font-semibold text-white">
            Free and open-source
          </h3>
          <p class="mt-1 text-lg text-gray-400">
            All components are freely available under a permissive open-source license.
          </p>
          <span
              class="mt-4 inline-flex items-center gap-x-1.5 font-bold text-lg text-white transition-all ease-in-out delay-50 duration-500 group-hover:text-aruna-700 group-focus:text-aruna-700">
            Learn more <IconChevronRight class="flex-shrink-0 size-4"/>
          </span>
        </div>
      </NuxtLink>
      <!-- End Icon Block -->

      <!-- Icon Block -->
      <NuxtLink to="https://github.com/ArunaStorage/aruna?tab=readme-ov-file#getting-started"
                target="_blank"
                class="group flex flex-col justify-center rounded-md p-4 md:p-7 transition-all ease-in-out delay-50 duration-500 focus:scale-105 hover:scale-105 hover:bg-aruna-700/[.15] focus:outline-none focus:ring-2 focus:ring-aruna-700">
        <div class="flex justify-center items-center mx-auto size-12 bg-aruna-800 rounded-md">
          <IconAdjustmentsCog class="flex-shrink-0 size-6 text-white"/>
        </div>
        <div class="mt-5 text-center">
          <h3 class="text-xl font-semibold text-white">
            Customizable
          </h3>
          <p class="mt-1 text-lg text-gray-400">
            Data proxy and server components are easily customizable to your needs.
          </p>
          <span
              class="mt-4 inline-flex items-center gap-x-1.5 font-bold text-lg text-white transition-all ease-in-out delay-50 duration-500 group-hover:text-aruna-700 group-focus:text-aruna-700">
            Learn more <IconChevronRight class="flex-shrink-0 size-4"/>
          </span>
        </div>
      </NuxtLink>
      <!-- End Icon Block -->

      <!-- Icon Block -->
      <NuxtLink href="https://arunastorage.github.io/documentation/latest"
                target="_blank"
                class="group flex flex-col justify-center rounded-md p-4 md:p-7 transition-all ease-in-out delay-50 duration-500 focus:scale-105 hover:scale-105 hover:bg-aruna-700/[.15] focus:outline-none focus:ring-2 focus:ring-aruna-700">
        <div class="flex justify-center items-center mx-auto size-12 bg-aruna-800 rounded-md">
          <IconAdjustmentsCog class="flex-shrink-0 size-6 text-white"/>
        </div>
        <div class="mt-5 text-center">
          <h3 class="text-xl font-semibold text-white">
            Documentation
          </h3>
          <p class="mt-1 text-lg text-gray-400">
            The comprehensive documentation makes getting started and jumping in to Aruna a breeze!
          </p>
          <span
              class="mt-4 inline-flex items-center gap-x-1.5 font-bold text-lg text-white transition-all ease-in-out delay-50 duration-500 group-hover:text-aruna-700 group-focus:text-aruna-700">
            Learn more <IconChevronRight class="flex-shrink-0 size-4"/>
          </span>
        </div>
      </NuxtLink>
      <!-- End Icon Block -->

      <!-- End Icon Block -->
    </div>
  </div>
</template>
