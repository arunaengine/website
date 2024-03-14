<script setup lang="ts">
import {
  IconBrandGithub, IconUserCircle, IconMenu2, IconX, IconMoon, IconSun, IconLogout,
  IconUserScan, IconBell, IconBucket, IconChevronDown
} from '@tabler/icons-vue';

const oidc = useOidc()
const anchor = ref(0)

/* Dark mode toggle */
const colorMode = useColorMode()
const toggleTheme = () => {
  colorMode.preference = colorMode.preference === 'dark' ? 'light' : 'dark';
};
</script>

<template>
  <header class="flex flex-wrap sm:justify-start sm:flex-nowrap w-full bg-transparent sm:py-4 md:py-2">
    <nav class="max-w-[85rem] w-full mx-auto px-8 flex flex-wrap basis-full items-center justify-between"
      aria-label="Global">

      <NuxtLink class="sm:order-1 text-xl font-semibold dark:text-white" href="/">
        <NuxtImg src="aruna_light.png" class="dark:hidden" height="24px" />
        <NuxtImg src="aruna_dark.png" class="hidden dark:inline" height="24px" />
      </NuxtLink>

      <div id="navbar-alignment"
        class="hs-collapse hidden overflow-hidden transition-all duration-300 basis-full grow sm:grow-0 sm:basis-auto sm:block sm:order-2">
        <div class="flex flex-col gap-5 mt-5 sm:flex-row sm:items-center sm:mt-0 sm:ps-5">
          <NuxtLink
            class="font-medium text-gray-600 dark:text-gray-300 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            to="/explore">
            Search
          </NuxtLink>

          <!-- Dropdown Start -->
          <div class="hs-dropdown [--strategy:static] sm:[--strategy:fixed] [--adaptive:none]">
            <button id="hs-mega-menu-basic-dr" type="button"
              class="flex items-center w-full text-gray-600 font-medium dark:text-gray-300 ">
              Docs
              <svg class="ms-1 flex-shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            <div
              class="hs-dropdown-menu transition-[opacity,margin] duration-[0.1ms] sm:duration-[150ms] hs-dropdown-open:opacity-100 opacity-0 sm:w-48 z-10 bg-white sm:shadow-md rounded-lg p-2 dark:bg-gray-800 sm:dark:border dark:border-gray-700 dark:divide-gray-700 before:absolute top-full sm:border before:-top-5 before:start-0 before:w-full before:h-5 hidden"
              style="">
              <a class="flex items-center gap-x-3.5 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-300 dark:hover:bg-gray-70"
                target="_blank" href="https://github.com/ArunaStorage/ArunaAPI">
                API
              </a>
              <a class="flex items-center gap-x-3.5 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-300 dark:hover:bg-gray-700 "
                target="_blank"
                href="https://arunastorage.github.io/Documentation/latest/get_started/basic_usage/00_index/">
                Getting Started
              </a>
              <a class="flex items-center gap-x-3.5 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-300 dark:hover:bg-gray-700 "
                target="_blank"
                href="https://arunastorage.github.io/Documentation/latest/internal_data_structure/internal_data_structure/">
                Data Structure
              </a>
            </div>
          </div>
          <!-- Dropdown End -->

          <a class="font-medium text-gray-600 dark:text-gray-300 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            target="_blank" href="https://github.com/ArunaStorage">
            <IconBrandGithub class="flex-shrink-0 size-4 inline-block" />
            Source Code
          </a>
        </div>
      </div>

      <div class="sm:order-3 flex items-center gap-x-2">
        <button type="button"
          class="sm:hidden hs-collapse-toggle p-2.5 inline-flex justify-center items-center gap-x-2 rounded-lg border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none dark:bg-transparent dark:border-gray-700 dark:text-white dark:hover:bg-white/10 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
          data-hs-collapse="#navbar-alignment" aria-controls="navbar-alignment" aria-label="Toggle navigation">
          <IconMenu2 class="icon hs-collapse-open:hidden flex-shrink-0 size-4" />
          <IconX class="icon hs-collapse-open:block hidden flex-shrink-0 size-4" />
        </button>

        <button type="button"
          class="block group flex items-center px-3 text-gray-600 font-medium dark:text-gray-300 "
          @click="toggleTheme">
            <IconMoon v-show="colorMode.preference === 'light'" class="theme-icon text-typography_primary_light dark:text-typography_primary_dark" width="28" height="28" />
            <IconSun v-show="colorMode.preference === 'dark'"  class="theme-icon text-typography_primary_light dark:text-typography_primary_dark" width="28" height="28" />
        </button>

        <!-- User Dropdown Start -->
        <div v-if="oidc.isLoggedIn" class="hs-dropdown [--strategy:static] sm:[--strategy:fixed] [--adaptive:none]">
          <button id="hs-mega-menu-basic-dr" type="button"
            class="border rounded p-2 flex items-center w-full text-gray-600 hover:border-arunaPrimary font-medium dark:text-gray-400 dark:hover:border-gray-500 ">
            <IconUserCircle class="mx-1 flex-shrink-0 size-4" />
            {{ oidc.user.displayName }}
            <IconChevronDown class="ms-1 flex-shrink-0 size-4" />
          </button>
          <div
            class="hs-dropdown-menu transition-[opacity,margin] duration-[0.1ms] sm:duration-[150ms] hs-dropdown-open:opacity-100 opacity-0 sm:w-48 z-10 bg-white sm:shadow-md rounded-lg p-2 dark:bg-gray-800 sm:dark:border dark:border-gray-700 dark:divide-gray-700 before:absolute top-full sm:border before:-top-5 before:start-0 before:w-full before:h-5 hidden"
            style="">
            <NuxtLink
              class="flex items-center gap-x-2 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700"
              to="/user/account">
              <IconUserScan class="flex-shrink-0 size-4" />
              Account
            </NuxtLink>
            <button class="disabled:opacity-50 disabled:pointer-events-none flex items-center gap-x-2 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700"
              href="/user/messages" disabled>
              <IconBell class="flex-shrink-0 size-4" />
              Messages
          </button>
            <NuxtLink
              class="flex items-center gap-x-2 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700"
              to="/user/resources">
              <IconBucket class="flex-shrink-0 size-4" />
              Resources
            </NuxtLink>
            <a @click="oidc.logout()"
              class="flex items-center gap-x-2 py-2 px-3 rounded-lg cursor-pointer text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700">
              <IconLogout class="flex-shrink-0 size-4" />
              Logout
            </a>
          </div>
        </div>
        <!-- User Dropdown End -->
        <button v-else
          class="flex items-center rounded gap-x-2 font-medium text-gray-500 border sm:my-6 md:my-0 p-2 dark:text-gray-400"
          @click="oidc.login()">
          Login
        </button>
      </div>
    </nav>
  </header>
</template>