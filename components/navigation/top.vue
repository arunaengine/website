<script setup lang="ts">
import {
  IconBrandGithub,
  IconMenu2,
  IconChevronDown
} from "@tabler/icons-vue"
import type { v2User } from "~/composables/aruna_api_json/models/v2User"

// Fetch user from global state
const user_state: Ref<v2User | undefined> = inject('userRef', ref(undefined))
const forceRefresh = ref(0)

onMounted(() => forceRefresh.value += 1);
</script>

<template>
  <header class="flex flex-wrap sm:justify-start sm:flex-nowrap w-full bg-transparent py-4 md:py-2">
    <nav aria-label="Global"
         class="max-w-[85rem] w-full mx-auto px-0 md:px-2 lg:px-8 flex flex-wrap basis-full items-center justify-between">
      <div class="flex">
        <NuxtLink href="/"
                  class="sm:order-2 font-semibold text-white">
          <img alt="Aruna logo" src="assets/imgs/aruna_dark.png" class="inline w-24 h-auto align-middle" />
        </NuxtLink>
      </div>

      <div id="navbar-alignment"
        class="hidden overflow-hidden transition-all duration-300 basis-full grow sm:grow-0 sm:basis-auto sm:block sm:order-2">
        <div class="flex flex-col gap-5 mt-5 sm:flex-row sm:items-center sm:mt-0 sm:ps-5">
          <NuxtLink
            class="font-medium text-gray-300 focus:outline-none focus:ring-2 focus:ring-aruna-700"
            to="/explore">
            Search
          </NuxtLink>

          <NuxtLink
              class="font-medium text-gray-300 focus:outline-none focus:ring-2 focus:ring-aruna-700"
              to="/user/dashboard">
            Dashboard
          </NuxtLink>

          <NuxtLink
              class="font-medium text-gray-300 focus:outline-none focus:ring-2 focus:ring-aruna-700"
              to="/news">
            News
          </NuxtLink>

          <!-- Dropdown Start -->
          <div class="hs-dropdown [--strategy:static] sm:[--strategy:fixed] [--adaptive:none]">
            <button id="hs-mega-menu-basic-dr" type="button"
                    class="flex items-center w-full text-gray-300 font-medium">
              Docs
              <IconChevronDown class="ms-1 flex-shrink-0 w-5 h-auto" />
            </button>

            <div
              class="hs-dropdown-menu transition-[opacity,margin] duration-[0.1ms] sm:duration-[150ms] hs-dropdown-open:opacity-100 opacity-0 sm:w-48 z-10 sm:shadow-md rounded-md p-2 bg-gray-800 border-gray-700 divide-gray-700 before:absolute top-full sm:border before:-top-5 before:start-0 before:w-full before:h-5 hidden">
              <NuxtLink href="https://github.com/ArunaStorage/api"
                        class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-300 hover:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                        target="_blank" >
                API
              </NuxtLink>
              <NuxtLink href="https://arunastorage.github.io/documentation/latest/get_started/basic_usage/00_index/"
                        class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-300 hover:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                        target="_blank">
                Getting Started
              </NuxtLink>
              <NuxtLink href="https://arunastorage.github.io/documentation/latest/internal_data_structure/internal_data_structure/"
                        class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-300 hover:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                        target="_blank">
                Data Structure
              </NuxtLink>
            </div>
          </div>
          <!-- Dropdown End -->

          <NuxtLink href="https://github.com/ArunaStorage"
                    class="font-medium text-gray-300 focus:outline-none focus:ring-2 focus:ring-aruna-700"
                    target="_blank">
            <IconBrandGithub class="flex-shrink-0 align-middle w-5 h-auto me-2 inline-block" />
          </NuxtLink>
        </div>
      </div>

      <div class="sm:order-3 flex items-center gap-x-2">
        <button type="button"
                :key="forceRefresh"
                :class="{'hidden': !user_state}"
                class="py-1 px-2 inline-flex items-center gap-x-2 text-sm font-medium rounded-md border border-gray-600 text-white shadow-sm disabled:opacity-50 disabled:pointer-events-none hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-aruna-700"
                data-hs-overlay="#docs-sidebar"
                aria-controls="docs-sidebar"
                aria-label="Toggle navigation">
          <span class="sr-only">Toggle Navigation</span>
          <span class="hidden md:block">{{ user_state?.displayName }}</span>
          <IconMenu2 class="size-5" />
        </button>
        <button
          :key="forceRefresh"
          :class="{'hidden' : user_state}"
          class="flex items-center gap-x-2 font-medium text-gray-300 sm:my-6 md:my-0 p-2">
          <a href="/auth/login">Login</a>
        </button>
        
      </div>
    </nav>
  </header>
</template>
