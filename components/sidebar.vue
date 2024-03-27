<script setup lang="ts">
import { IconBell } from '@tabler/icons-vue';
import { IconBook } from '@tabler/icons-vue';
import { IconBucket } from '@tabler/icons-vue';
import { IconLogout, IconUserScan, IconUserUp } from '@tabler/icons-vue';
import type { v2User } from '~/composables/aruna_api_json/models/v2User';

const colorMode = useColorMode()

const userState: globalThis.Ref<v2User | undefined> = useState("user")
const isLoggedIn = computed(() => userState.value !== undefined)
</script>

<template>
  <!-- Navigation Toggle -->
  <div id="docs-sidebar"
    class="hs-overlay hs-overlay-open:translate-x-0 -translate-x-full transition-all duration-300 transform hidden fixed top-0 start-0 bottom-0 z-[60] w-64 bg-white border-e border-gray-200 pt-7 pb-10 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-slate-700 dark:[&::-webkit-scrollbar-thumb]:bg-slate-500 dark:bg-gray-800 dark:border-gray-700">
    <div class="flex-auto px-6 items-center">
      <a class="flex grow justify-center text-xl font-semibold dark:text-white" href="/" aria-label="Brand">
        <img v-if="colorMode.preference === 'light'" src="assets/imgs/aruna_light.png" height="36px" />
        <img v-else-if="colorMode.preference === 'dark'" src="assets/imgs/aruna_dark.png" height="36px" />
      </a>
    </div>
    <nav class="hs-accordion-group p-6 w-full flex flex-col flex-wrap" data-hs-accordion-always-open>
      <ul class="space-y-1.5">
        <li v-if="isLoggedIn && isUserAdmin(userState)">
          <NuxtLink to="/user/admin"
            class="flex items-center gap-x-2 py-2 px-3 rounded-lg cursor-pointer text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700">
            <IconUserUp class="size-4" />
            Administration
          </NuxtLink>
          <hr class="border-gray-200 my-5" />
        </li>

        <li v-if="isLoggedIn">
          <NuxtLink to="/user/account"
            class="flex items-center gap-x-2 py-2 px-3 rounded-lg cursor-pointer text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700">
            <IconUserScan class="size-4" />
            Account
          </NuxtLink>
        </li>

        <li v-if="isLoggedIn">
          <a href="/user/messages"
            class="flex items-center gap-x-2 py-2 px-3 rounded-lg cursor-pointer text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700 opacity-50 pointer-events-none">
            <IconBell class="size-4" />
            Messages
          </a>
        </li>

        <li v-if="isLoggedIn">
          <NuxtLink to="/user/resources"
            class="flex items-center gap-x-2 py-2 px-3 rounded-lg cursor-pointer text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700">
            <IconBucket class="size-4" />
            Resources
          </NuxtLink>
        </li>

        <li>
          <a href="/auth/logout"
            class="flex items-center gap-x-2 py-2 px-3 rounded-lg cursor-pointer text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700">
            <IconLogout class="flex-shrink-0 size-4" />
            Logout
          </a>
        </li>

        <li>
          <hr class="border-gray-200 my-5" />
          <a class="flex items-center gap-x-3.5 py-2 px-2.5 text-sm text-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 dark:text-slate-400 dark:hover:text-slate-300 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            href="#">
            <IconBook class="flex-shrink-0 size-4" />
            Documentation
          </a>
        </li>
      </ul>
    </nav>
  </div>
</template>