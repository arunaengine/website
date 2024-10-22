<script setup lang="ts">
import {
  IconBell,
  IconBook,
  IconBrandGithub,
  IconBucket,
  IconLogout,
  IconNews,
  IconSearch,
  IconUserScan,
  IconUserUp
} from '@tabler/icons-vue';
import type {v2User} from '~/composables/aruna_api_json/models/v2User';

const userState: Ref<v2User | undefined> = inject('userRef', ref(undefined))
const isLoggedIn = computed(() => userState.value !== undefined)

function closeSidebar() {
  closeModal('docs-sidebar')
}
</script>

<template>
  <!-- Navigation Toggle -->
  <div id="docs-sidebar"
       class="hs-overlay hs-overlay-open:translate-x-0 -translate-x-full transition-all duration-300 transform hidden fixed top-0 start-0 bottom-0 z-[60] w-64 bg-gray-800 border-e border-gray-700 pt-7 pb-10 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-700 [&::-webkit-scrollbar-thumb]:bg-slate-500">
    <div class="flex-auto px-6 items-center">
      <a href="/"
         aria-label="Brand"
         class="flex grow justify-center text-xl font-semibold text-white" >
        <img src="../../assets/imgs/aruna_dark.png" alt="Aruna logo"/>
      </a>
    </div>
    <nav class="hs-accordion-group p-6 w-full flex flex-col flex-wrap" data-hs-accordion-always-open>
      <ul class="space-y-1.5">
        <li v-if="isLoggedIn && isUserAdmin(userState)">
          <NuxtLink to="/user/admin"
                    @click="closeSidebar"
                    class="flex items-center gap-x-2 py-2 px-3 rounded-md cursor-pointer text-sm text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-aruna-700">
            <IconUserUp class="size-4"/>
            Administration
          </NuxtLink>
          <hr class="border-gray-200 my-5"/>
        </li>

        <li v-if="isLoggedIn">
          <NuxtLink to="/user/account"
                    @click="closeSidebar"
                    class="flex items-center gap-x-2 py-2 px-3 rounded-md cursor-pointer text-sm text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-aruna-700">
            <IconUserScan class="size-4"/>
            Account
          </NuxtLink>
        </li>

        <li v-if="isLoggedIn">
          <a href="/user/messages"
             @click="closeSidebar"
             class="flex items-center gap-x-2 py-2 px-3 rounded-md cursor-pointer text-sm text-gray-400 hover:bg-gray-700 focus:ring-2 focus:ring-blue-500 opacity-50 pointer-events-none">
            <IconBell class="size-4"/>
            Messages
          </a>
        </li>

        <li v-if="isLoggedIn">
          <NuxtLink to="/user/resources"
                    @click="closeSidebar"
                    class="flex items-center gap-x-2 py-2 px-3 rounded-md cursor-pointer text-sm text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-aruna-700">
            <IconBucket class="size-4"/>
            Resources
          </NuxtLink>
        </li>

        <li class="sm:hidden">
          <hr class="border-gray-200 my-5"/>
          <NuxtLink to="/explore"
                    @click="closeSidebar"
                    class="flex items-center gap-x-2 py-2 px-3 rounded-md cursor-pointer text-sm text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-aruna-700">
            <IconSearch class="flex-shrink-0 size-4"/>
            Search
          </NuxtLink>
        </li>

        <li class="sm:hidden">
          <NuxtLink to="/news"
                    @click="closeSidebar"
                    class="flex items-center gap-x-2 py-2 px-3 rounded-md cursor-pointer text-sm text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-aruna-700">
            <IconNews class="flex-shrink-0 size-4"/>
            News
          </NuxtLink>
        </li>
        <li class="hs-accordion sm:hidden" id="docs-sidebar-accordion">
          <button type="button"
                  class="hs-accordion-toggle hs-accordion-active:hover:bg-transparent w-full text-start flex items-center gap-x-2 py-2 px-3 text-sm text-gray-300 rounded-md hover:bg-gray-700 hs-accordion-active:text-white">
            <IconBook class="flex-shrink-0 size-4"/>
            Docs
            <svg
                class="hs-accordion-active:block ms-auto hidden size-4 text-gray-300 group-hover:text-gray-500"
                xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m18 15-6-6-6 6"/>
            </svg>
            <svg
                class="hs-accordion-active:hidden ms-auto block size-4 text-gray-300 group-hover:text-gray-500"
                xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>

          <div id="docs-sidebar-accordion"
               class="hs-accordion-content w-full overflow-hidden transition-[height] duration-300 hidden">
            <ul class="pt-2 ps-2">
              <li>
                <NuxtLink to="https://github.com/ArunaStorage/api"
                          target="_blank"
                          class="flex items-center gap-x-2 py-2 px-4 text-sm text-gray-300 rounded-md hover:bg-gray-700">
                  API
                </NuxtLink>
              </li>
              <li>
                <NuxtLink to="https://arunastorage.github.io/documentation/latest/get_started/basic_usage/00_index/"
                          target="_blank"
                          class="flex items-center gap-x-2 py-2 px-4 text-sm text-gray-300 rounded-md hover:bg-gray-700">
                  Getting Started
                </NuxtLink>
              </li>
              <li>
                <NuxtLink
                    to="https://arunastorage.github.io/documentation/latest/internal_data_structure/internal_data_structure/"
                    target="_blank"
                    class="flex items-center gap-x-2 py-2 px-4 text-sm text-gray-300 rounded-md hover:bg-gray-700">
                  Data Structure
                </NuxtLink>
              </li>
            </ul>
          </div>
        </li>
        <li class="sm:hidden">
          <NuxtLink to="https://github.com/ArunaStorage"
                    target="_blank"
                    class="flex items-center gap-x-2 py-2 px-3 rounded-md cursor-pointer text-sm text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-aruna-700">
            <IconBrandGithub class="flex-shrink-0 size-4"/>
            Source Code
          </NuxtLink>
        </li>

        <li>
          <hr class="border-gray-200 my-5"/>
          <a href="/auth/logout"
             class="flex items-center gap-x-2 py-2 px-3 rounded-md cursor-pointer text-sm text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-aruna-700">
            <IconLogout class="flex-shrink-0 size-4"/>
            Logout
          </a>
        </li>
      </ul>
    </nav>
  </div>
</template>