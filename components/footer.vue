<script setup lang="ts">
import {IconBrandGithub} from "@tabler/icons-vue";
</script>
<template>
  <div class="w-[100vw] bg-aruna-bg/90">
    <footer class="w-full max-w-[85rem] p-4 sm:px-6 lg:px-8 mx-auto">
      <!-- Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 items-center gap-5 text-center">
        <div>
          <NuxtLink href="#" aria-label="Brand"
                    class="flex-none text-xl font-semibold text-aruna-text-accent focus:outline-none focus:ring-1 focus:ring-aruna-highlight">
          </NuxtLink>
        </div>
        <!-- End Col -->

        <ul class="text-center">
          <li class="inline-block relative pe-8 last:pe-0 last-of-type:before:hidden before:absolute before:top-1/2 before:end-3 before:-translate-y-1/2 before:content-['/'] before:text-aruna-text-accent">
            <NuxtLink href="/about"
                      class="inline-flex gap-x-2 text-sm text-aruna-text-accent focus:outline-none focus:ring-1 focus:ring-aruna-highlight">
              About
            </NuxtLink>
          </li>
          <li class="inline-block relative pe-8 last:pe-0 last-of-type:before:hidden before:absolute before:top-1/2 before:end-3 before:-translate-y-1/2 before:content-['/'] before:text-aruna-text-accent">
            <NuxtLink href="/imprint"
                      class="inline-flex gap-x-2 text-sm text-aruna-text-accent focus:outline-none focus:ring-1 focus:ring-aruna-highlight">
              Imprint
            </NuxtLink>
          </li>
          <li class="inline-block relative pe-8 last:pe-0 last-of-type:before:hidden before:absolute before:top-1/2 before:end-3 before:-translate-y-1/2 before:content-['/'] before:text-aruna-text-accent">
            <NuxtLink href="/tos"
                      class="inline-flex gap-x-2 text-sm text-aruna-text-accent focus:outline-none focus:ring-1 focus:ring-aruna-highlight">
              Terms of Service
            </NuxtLink>
          </li>
        </ul>
        <!-- End Col -->

        <!-- Social Brands -->
        <div class="md:text-end space-x-2">
          <a target="_blank"
             href="https://github.com/ArunaStorage"
             class="size-8 inline-flex justify-center items-center gap-x-2 text-sm font-semibold rounded-full border border-aruna-text-accent text-aruna-text-accent hover:text-aruna-highlight hover:border-aruna-highlight disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-aruna-700">
            <IconBrandGithub class="flex-shrink-0 size-4"/>
          </a>
        </div>
        <!-- End Social Brands -->
      </div>
      <!-- End Grid -->
    </footer>
  </div>
</template>