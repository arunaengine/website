<script setup lang="ts">
import {IconBrandGithub} from "@tabler/icons-vue";
</script>
<template>
  <div class="w-[100vw] bg-muted/40">
    <footer class="w-full max-w-[85rem] p-4 sm:px-6 lg:px-8 mx-auto">
      <!-- Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 items-center gap-5 text-center">
        <div>
          <NuxtLink href="#" aria-label="Brand"
                    class="flex-none text-xl font-semibold text-white focus:outline-none focus:ring-2 focus:ring-aruna-700">
          </NuxtLink>
        </div>
        <!-- End Col -->

        <ul class="text-center">
          <li class="inline-block relative pe-8 last:pe-0 last-of-type:before:hidden before:absolute before:top-1/2 before:end-3 before:-translate-y-1/2 before:content-['/'] before:text-gray-400">
            <NuxtLink href="/about"
                      class="inline-flex gap-x-2 text-sm text-gray-400 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-aruna-700">
              About
            </NuxtLink>
          </li>
          <li class="inline-block relative pe-8 last:pe-0 last-of-type:before:hidden before:absolute before:top-1/2 before:end-3 before:-translate-y-1/2 before:content-['/'] before:text-gray-400">
            <NuxtLink href="/imprint"
                      class="inline-flex gap-x-2 text-sm text-gray-400 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-aruna-700">
              Imprint
            </NuxtLink>
          </li>
          <li class="inline-block relative pe-8 last:pe-0 last-of-type:before:hidden before:absolute before:top-1/2 before:end-3 before:-translate-y-1/2 before:content-['/'] before:text-gray-400">
            <NuxtLink href="/tos"
                      class="inline-flex gap-x-2 text-sm text-gray-400 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-aruna-700">
              Terms of Service
            </NuxtLink>
          </li>
        </ul>
        <!-- End Col -->

        <!-- Social Brands -->
        <div class="md:text-end space-x-2">
          <a target="_blank"
             href="https://github.com/ArunaStorage"
             class="size-8 inline-flex justify-center items-center gap-x-2 text-sm font-semibold rounded-full border border-gray-300 text-gray-400 hover:bg-gray-700 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-aruna-700">
            <IconBrandGithub class="flex-shrink-0 size-4"/>
          </a>
        </div>
        <!-- End Social Brands -->
      </div>
      <!-- End Grid -->
    </footer>
  </div>
</template>