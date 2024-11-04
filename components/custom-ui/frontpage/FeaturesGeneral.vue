<script lang="ts" setup>
import {IconBook, IconAdjustmentsCog, IconBrandOpenSource, IconChevronRight} from "@tabler/icons-vue";
</script>
<template>
  <div class="container mt-12 rounded-md border border-aruna-text/50 px-4 py-6 sm:px-6 lg:px-8 mx-auto bg-aruna-bg/90">
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 items-center gap-4">

      <!-- Icon Block -->
      <NuxtLink class="group flex flex-col justify-center rounded-md p-4 md:p-7 transition-all ease-in-out delay-50 duration-500 focus:scale-105 hover:scale-105 hover:bg-aruna-fg focus:outline-none focus:ring-1 focus:ring-aruna-highlight"
                target="_blank"
                to="https://github.com/ArunaStorage/aruna/tree/main?tab=readme-ov-file#license">
        <div class="flex px-4 py-1 justify-center items-center mx-auto text-aruna-highlight rounded-md border border-aruna-highlight">
          <IconBrandOpenSource class="flex-shrink-0 size-20"/>
        </div>
        <div class="mt-5 text-center">
          <h3 class="text-xl font-semibold text-aruna-text-accent">
            Free and open-source
          </h3>
          <p class="mt-1 text-lg text-aruna-text">
            All components are freely available under a permissive open-source license.
          </p>
          <span
              class="mt-4 inline-flex items-center gap-x-1.5 font-bold text-lg text-aruna-highlight transition-all ease-in-out delay-50 duration-500 group-hover:text-aruna-highlight group-focus:text-aruna-highlight">
            Learn more <IconChevronRight class="flex-shrink-0 size-4"/>
          </span>
        </div>
      </NuxtLink>
      <!-- End Icon Block -->

      <!-- Icon Block -->
      <NuxtLink class="group flex flex-col justify-center rounded-md p-4 md:p-7 transition-all ease-in-out delay-50 duration-500 focus:scale-105 hover:scale-105 hover:bg-aruna-fg focus:outline-none focus:ring-1 focus:ring-aruna-highlight"
                target="_blank"
                to="https://github.com/ArunaStorage/aruna?tab=readme-ov-file#getting-started">
        <div class="flex px-4 py-1 justify-center items-center mx-auto text-aruna-highlight rounded-md border border-aruna-highlight">
          <IconAdjustmentsCog class="flex-shrink-0 size-20"/>
        </div>
        <div class="mt-5 text-center">
          <h3 class="text-xl font-semibold text-aruna-text-accent">
            Customizable
          </h3>
          <p class="mt-1 text-lg text-aruna-text">
            Data proxy and server components are easily customizable to your needs.
          </p>
          <span
              class="mt-4 inline-flex items-center gap-x-1.5 font-bold text-lg text-aruna-highlight transition-all ease-in-out delay-50 duration-500 group-hover:text-aruna-highlight group-focus:text-aruna-highlight">
            Learn more <IconChevronRight class="flex-shrink-0 size-4"/>
          </span>
        </div>
      </NuxtLink>
      <!-- End Icon Block -->

      <!-- Icon Block -->
      <NuxtLink class="group flex flex-col justify-center rounded-md p-4 md:p-7 transition-all ease-in-out delay-50 duration-500 focus:scale-105 hover:scale-105 hover:bg-aruna-fg focus:outline-none focus:ring-1 focus:ring-aruna-highlight"
                href="https://arunastorage.github.io/documentation/latest"
                target="_blank">
        <div class="flex px-4 py-1 justify-center items-center mx-auto text-aruna-highlight rounded-md border border-aruna-highlight">
          <!--<IconBook class="flex-shrink-0 size-20"/>-->
          <svg class="flex-shrink-0 size-20 fill-aruna-600"
               viewBox="0 -960 960 960" xmlns="http://www.w3.org/2000/svg">
            <path d="M480-160q-48-38-104-59t-116-21q-42 0-82.5 11T100-198q-21 11-40.5-1T40-234v-482q0-11 5.5-21T62-752q46-24 96-36t102-12q58 0 113.5 15T480-740v484q51-32 107-48t113-16q36 0 70.5 6t69.5 18v-480q15 5 29.5 10.5T898-752q11 5 16.5 15t5.5 21v482q0 23-19.5 35t-40.5 1q-37-20-77.5-31T700-240q-60 0-116 21t-104 59Zm80-200v-380l200-200v400L560-360Zm-160 65v-396q-33-14-68.5-21.5T260-720q-37 0-72 7t-68 21v397q35-13 69.5-19t70.5-6q36 0 70.5 6t69.5 19Zm0 0v-396 396Z"/>
          </svg>
        </div>
        <div class="mt-5 text-center">
          <h3 class="text-xl font-semibold text-aruna-text-accent">
            Documentation
          </h3>
          <p class="mt-1 text-lg text-aruna-text">
            The comprehensive documentation makes getting started in Aruna a breeze!
          </p>
          <span
              class="mt-4 inline-flex items-center gap-x-1.5 font-bold text-lg text-aruna-highlight transition-all ease-in-out delay-50 duration-500 group-hover:text-aruna-highlight group-focus:text-aruna-highlight">
            Learn more <IconChevronRight class="flex-shrink-0 size-4"/>
          </span>
        </div>
      </NuxtLink>
      <!-- End Icon Block -->

      <!-- End Icon Block -->
    </div>
  </div>
</template>
