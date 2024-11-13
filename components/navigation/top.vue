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
import type {v2User} from "~/composables/aruna_api_json/models/v2User"
import LoginDialog from "~/components/custom-ui/dialog/LoginDialog.vue";

// Fetch user from global state
const user_state: Ref<v2User | undefined> = inject('userRef', ref(undefined))
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

          <NuxtLink
              class="font-medium text-aruna-text-accent focus:outline-none focus:ring-1 focus:ring-aruna-highlight"
              to="/news">
            News
          </NuxtLink>

          <!-- Dropdown Start -->
          <div class="hs-dropdown [--strategy:static] sm:[--strategy:fixed] [--adaptive:none]">
            <button id="hs-mega-menu-basic-dr" type="button"
                    class="flex items-center w-full text-aruna-text-accent font-medium">
              Docs
              <IconChevronDown class="ms-1 flex-shrink-0 w-5 h-auto"/>
            </button>

            <div
                class="hs-dropdown-menu transition-[opacity,margin] duration-[0.1ms] sm:duration-[150ms] hs-dropdown-open:opacity-100 opacity-0 sm:w-48 z-10 sm:shadow-md rounded-md p-2 bg-aruna-bg/90 border-aruna-text/50 divide-aruna-text/50 before:absolute top-full sm:border before:-top-5 before:start-0 before:w-full before:h-5 hidden">
              <NuxtLink href="https://github.com/arunaengine/api"
                        class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-aruna-text hover:bg-aruna-fg focus:ring-1 focus:ring-aruna-highlight"
                        target="_blank">
                API
              </NuxtLink>
              <NuxtLink href="https://docs.aruna-engine.org/latest/get_started/basic_usage/00_index/"
                        class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-aruna-text hover:bg-aruna-fg focus:ring-1 focus:ring-aruna-highlight"
                        target="_blank">
                Getting Started
              </NuxtLink>
              <NuxtLink href="https://docs.aruna-engine.org/latest/internal_data_structure/internal_data_structure/"
                        class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-aruna-text hover:bg-aruna-fg focus:ring-1 focus:ring-aruna-highlight"
                        target="_blank">
                Data Structure
              </NuxtLink>
            </div>
          </div>
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
                {{ user_state?.displayName }}
                <IconMenu2 class="size-5"/>
              </DropdownMenuTrigger>
              <DropdownMenuContent class="bg-aruna-muted">
                <DropdownMenuLabel v-if="user_state && user_state.attributes?.globalAdmin"
                                   class="flex hover:bg-aruna-fg focus:bg-aruna-fg">
                  <NuxtLink to="/user/admin"
                            class="flex items-center gap-x-2">
                    <IconUserUp class="size-4"/>
                    Administration
                  </NuxtLink>
                </DropdownMenuLabel>

                <DropdownMenuSeparator v-if="user_state && user_state.attributes?.globalAdmin"/>

                <DropdownMenuLabel class="flex hover:bg-aruna-fg focus:bg-aruna-fg">
                  <NuxtLink to="/user/account"
                            class="flex items-center gap-x-2">
                    <IconUserScan class="size-4"/>
                    Account
                  </NuxtLink>
                </DropdownMenuLabel>
                <DropdownMenuLabel class="flex hover:bg-aruna-fg focus:bg-aruna-fg">
                  <NuxtLink to="/user/resources"
                            class="flex items-center gap-x-2">
                    <IconBucket class="size-4"/>
                    Resources
                  </NuxtLink>
                </DropdownMenuLabel>

                <DropdownMenuSeparator/>

                <DropdownMenuLabel class="flex sm:hidden hover:bg-aruna-fg focus:bg-aruna-fg">
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
