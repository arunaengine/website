<script setup lang="ts">
import { IconBrandGithub, IconMenu2, IconMoon, IconSun, IconChevronDown, } from "@tabler/icons-vue"
import type { v2User } from "~/composables/aruna_api_json/models/v2User"

// Fetch user from global state
const user_state: Ref<v2User | undefined> = inject('userRef', ref(undefined))
const forceRefresh = ref(0)

/* Dark mode toggle */
const colorMode = useColorMode();
const toggleTheme = () => {
  colorMode.preference = colorMode.preference === "dark" ? "light" : "dark";
};

onMounted(() => {
  colorMode.preference = colorMode.value;
  forceRefresh.value += 1
});
</script>

<template>
  <header class="flex flex-wrap sm:justify-start sm:flex-nowrap w-full bg-transparent sm:py-4 md:py-2">
    <nav
      class="max-w-[85rem] w-full mx-auto lg:px-8 md:px-2 px-0 flex flex-wrap basis-full items-center justify-between"
      aria-label="Global">
      <div class="flex">
        <NuxtLink class="sm:order-2 font-semibold dark:text-white" href="/">
          <img alt="Aruna logo for light mode" src="assets/imgs/aruna_light.png" class="dark:hidden w-24 h-auto align-middle" />
          <img alt="Aruna logo for dark mode" src="assets/imgs/aruna_dark.png" class="hidden dark:inline w-24 h-auto align-middle" />
        </NuxtLink>
      </div>

      <div id="navbar-alignment"
        class="hidden overflow-hidden transition-all duration-300 basis-full grow sm:grow-0 sm:basis-auto sm:block sm:order-2">
        <div class="flex flex-col gap-5 mt-5 sm:flex-row sm:items-center sm:mt-0 sm:ps-5">
          <NuxtLink
            class="font-medium text-gray-600 dark:text-gray-300 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            to="/explore">
            Search
          </NuxtLink>

          <NuxtLink
              class="font-medium text-gray-600 dark:text-gray-300 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
              to="/news">
            News
          </NuxtLink>

          <!-- Dropdown Start -->
          <div class="hs-dropdown [--strategy:static] sm:[--strategy:fixed] [--adaptive:none]">
            <button id="hs-mega-menu-basic-dr" type="button"
              class="flex items-center w-full text-gray-600 font-medium dark:text-gray-300">
              Docs
              <IconChevronDown class="ms-1 flex-shrink-0 w-5 h-auto" />
            </button>

            <div
              class="hs-dropdown-menu transition-[opacity,margin] duration-[0.1ms] sm:duration-[150ms] hs-dropdown-open:opacity-100 opacity-0 sm:w-48 z-10 bg-white sm:shadow-md rounded-md p-2 dark:bg-gray-800 sm:dark:border dark:border-gray-700 dark:divide-gray-700 before:absolute top-full sm:border before:-top-5 before:start-0 before:w-full before:h-5 hidden"
              style="">
              <a class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-300 dark:hover:bg-gray-700"
                target="_blank" href="https://github.com/ArunaStorage/api">
                API
              </a>
              <a class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-300 dark:hover:bg-gray-700"
                target="_blank"
                href="https://arunastorage.github.io/documentation/latest/get_started/basic_usage/00_index/">
                Getting Started
              </a>
              <a class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-300 dark:hover:bg-gray-700"
                target="_blank"
                href="https://arunastorage.github.io/documentation/latest/internal_data_structure/internal_data_structure/">
                Data Structure
              </a>
            </div>
          </div>
          <!-- Dropdown End -->

          <a class="font-medium text-gray-600 dark:text-gray-300 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            target="_blank" href="https://github.com/ArunaStorage">
            <IconBrandGithub class="flex-shrink-0 align-middle w-5 h-auto me-2 inline-block" />
          </a>
        </div>
      </div>

      <div class="sm:order-3 flex items-center gap-x-2">
        <button type="button"
          :key="forceRefresh"
          :class="{'hidden' : !user_state}"
          class="py-1 px-2 inline-flex items-center gap-x-2 text-sm font-medium rounded-md border border-gray-200 text-gray-600 shadow-sm disabled:opacity-50 disabled:pointer-events-none dark:border-gray-700 dark:text-white dark:hover:bg-gray-800 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
          data-hs-overlay="#docs-sidebar" aria-controls="docs-sidebar" aria-label="Toggle navigation">
          <span class="sr-only">Toggle Navigation</span>
          <!-- <IconUserCircle class="mx-1 flex-shrink-0 w-5 h-auto" /> -->
          <span class="hidden md:block">{{ user_state?.displayName }}</span>
          <IconMenu2 class="size-5" />
        </button>
        <button
          :key="forceRefresh"
          :class="{'hidden' : user_state}"
          class="flex items-center gap-x-2 font-medium text-gray-600 sm:my-6 md:my-0 p-2 dark:text-gray-300">
          <a href="/auth/login">Login</a>
        </button>
        
      </div>
    </nav>
  </header>
</template>
