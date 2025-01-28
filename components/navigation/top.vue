<script setup lang="ts">
import {
  IconBrandGithub,
  IconMenu2,
  IconChevronDown,
  IconLogout,
  IconUserUp,
  IconUserScan,
  IconBucket,
  IconSearch,
  IconNews,
  IconBook
} from "@tabler/icons-vue"
import LoginDialog from "~/components/custom-ui/dialog/LoginDialog.vue";
import type {User} from "~/composables/api_wrapper";

// Fetch user from global state
const user_state: Ref<User | undefined> = inject('userRef', ref(undefined))
const forceRefresh = ref(0)

onMounted(() => forceRefresh.value += 1);
</script>

<template>
  <header class="flex flex-wrap sm:justify-start sm:flex-nowrap w-full bg-transparent py-4 md:p-2 max-h-[46px]">
    <nav aria-label="Global"
         class="max-w-[85rem] w-full mx-auto px-0 md:px-2 lg:px-8 flex flex-wrap basis-full items-center justify-between">
      <div class="flex">
        <NuxtLink href="/"
                  class="sm:order-2 font-semibold text-aruna-text-accent focus:outline-none focus:ring-1 focus:ring-aruna-highlight">
          <img src="/imgs/aruna_dark.webp"
               alt="Aruna logo"
               class="inline w-24 h-auto align-middle"/>
        </NuxtLink>
      </div>

      <div id="navbar-alignment"
           class="hidden overflow-hidden transition-all duration-300 basis-full grow sm:grow-0 sm:basis-auto sm:block sm:order-2">
        <div class="flex flex-col gap-5 mt-5 sm:flex-row sm:items-center sm:mt-0 sm:ps-5">
          <NuxtLink
              class="font-medium text-aruna-text-accent focus:outline-none focus:ring-1 focus:ring-aruna-highlight"
              to="/explore">
            Search
          </NuxtLink>

          <NuxtLink v-if="user_state"
                    class="font-medium text-aruna-text-accent focus:outline-none focus:ring-1 focus:ring-aruna-highlight"
                    to="/user/dashboard">
            Dashboard
          </NuxtLink>

          <NuxtLink
              class="font-medium text-aruna-text-accent focus:outline-none focus:ring-1 focus:ring-aruna-highlight"
              to="/news">
            News
          </NuxtLink>

          <!-- Dropdown Start -->
          <DropdownMenu>
            <DropdownMenuTrigger class="flex items-center gap-x-2 font-medium text-aruna-text-accent focus:outline-none focus:ring-1 focus:ring-aruna-highlight">
              Docs
              <IconChevronDown class="size-4"/>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem class="flex hover:bg-aruna-fg focus:bg-aruna-fg">
                <NuxtLink href="https://github.com/arunaengine/api"
                          target="_blank"
                          class="w-full">
                  API
                </NuxtLink>
              </DropdownMenuItem>
              <DropdownMenuItem class="flex hover:bg-aruna-fg focus:bg-aruna-fg">
                <NuxtLink href="https://docs.aruna-engine.org/latest/get_started/basic_usage/00_index/"
                          target="_blank"
                          class="w-full">
                  Getting Started
                </NuxtLink>
              </DropdownMenuItem>
              <DropdownMenuItem class="flex hover:bg-aruna-fg focus:bg-aruna-fg">
                <NuxtLink href="https://docs.aruna-engine.org/latest/internal_data_structure/internal_data_structure/"
                          target="_blank"
                          class="w-full">
                  Data Structure
                </NuxtLink>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <!-- Dropdown End -->

          <NuxtLink href="https://github.com/arunaengine"
                    class="font-medium text-aruna-text-accent hover:text-aruna-highlight focus:outline-none focus:ring-1 focus:ring-aruna-highlight"
                    target="_blank">
            <IconBrandGithub class="flex-shrink-0 align-middle w-5 h-auto me-2 inline-block"/>
          </NuxtLink>
        </div>
      </div>

      <div class="sm:order-3 flex items-center gap-x-2">
        <ClientOnly>
          <div>
            <DropdownMenu v-if="user_state">
              <DropdownMenuTrigger class="px-2 py-1 flex items-center justify-center gap-x-2 rounded-sm border border-aruna-text-accent">
                {{ user_state?.first_name }} {{ user_state?.last_name }}
                <IconMenu2 class="size-5"/>
              </DropdownMenuTrigger>
              <DropdownMenuContent class="bg-aruna-muted">
                <DropdownMenuLabel v-if="user_state"
                                   class="flex hover:bg-aruna-fg focus:bg-aruna-fg">
                  <NuxtLink to="/user/dashboard"
                            class="flex items-center gap-x-2">
                    <IconUserScan class="size-4"/>
                    Dashboard
                  </NuxtLink>
                </DropdownMenuLabel>

                <DropdownMenuSeparator/>

                <DropdownMenuLabel v-if="user_state"
                                   class="flex sm:hidden hover:bg-aruna-fg focus:bg-aruna-fg">
                  <NuxtLink to="/explore"
                            class="flex items-center gap-x-2">
                    <IconSearch class="flex-shrink-0 size-4"/>
                    Search
                  </NuxtLink>
                </DropdownMenuLabel>
                <DropdownMenuLabel class="sm:hidden flex hover:bg-aruna-fg focus:bg-aruna-fg">
                  <NuxtLink to="/news"
                            class="flex items-center gap-x-2">
                    <IconNews class="flex-shrink-0 size-4"/>
                    News
                  </NuxtLink>
                </DropdownMenuLabel>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger class="flex sm:hidden font-semibold items-center gap-x-2 hover:bg-aruna-fg focus:bg-aruna-fg data-[state=open]:bg-aruna-fg">
                    <IconBook class="flex-shrink-0 size-4"/>
                    Docs
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent class="bg-aruna-muted">
                      <DropdownMenuLabel class="sm:hidden flex hover:bg-aruna-fg focus:bg-aruna-fg">
                        <NuxtLink to="https://github.com/arunaengine/api"
                                  target="_blank"
                                  class="flex items-center gap-x-2">
                          API
                        </NuxtLink>
                      </DropdownMenuLabel>
                      <DropdownMenuLabel class="sm:hidden flex hover:bg-aruna-fg focus:bg-aruna-fg">
                        <NuxtLink to="https://docs.aruna-engine.org/latest/get_started/basic_usage/00_index/"
                                  target="_blank"
                                  class="flex items-center gap-x-2">
                          Getting Started
                        </NuxtLink>
                      </DropdownMenuLabel>
                      <DropdownMenuLabel class="sm:hidden flex hover:bg-aruna-fg focus:bg-aruna-fg">
                        <NuxtLink to="https://docs.aruna-engine.org/latest/internal_data_structure/internal_data_structure/"
                                  target="_blank"
                                  class="flex items-center gap-x-2">
                          Data Structure
                        </NuxtLink>
                      </DropdownMenuLabel>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>

                <DropdownMenuSeparator class="sm:hidden"/>

                <DropdownMenuItem class="flex hover:bg-aruna-fg focus:bg-aruna-fg">
                  <a href="/auth/logout" class="flex items-center justify-center gap-x-2">
                    <IconLogout class="flex-shrink-0 size-4"/>
                    Logout
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <LoginDialog v-else/>
          </div>
        </ClientOnly>
      </div>
    </nav>
  </header>
</template>
