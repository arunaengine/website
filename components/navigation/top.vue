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
  IconBook,
  IconArrowUpRight
} from "@tabler/icons-vue"
import type {v2User} from "~/composables/aruna_api_json/models/v2User"
import LoginDialog from "~/components/custom-ui/dialog/LoginDialog.vue";

// Fetch user from global state
const user_state: Ref<v2User | undefined> = inject('userRef', ref(undefined))
const forceRefresh = ref(0)
const devInstance = ref<boolean>(false)

onMounted(() => {
  forceRefresh.value += 1
  devInstance.value = window.location.hostname.includes('dev.')
});
</script>

<template>
  <a href="https://v3.aruna-engine.org"
     target="_blank"
     rel="noopener"
     class="group block truncate border-b border-aruna-tagline/40 bg-aruna-tagline/10 px-4 py-2 text-center text-xs text-aruna-tagline transition-colors hover:bg-aruna-tagline/20">
    <span class="me-2 rounded-full bg-aruna-tagline/20 px-2 py-0.5 font-semibold">Public testing</span>
    Aruna V3 is open for testing.
    <span class="font-semibold underline-offset-4 group-hover:underline">Try it &rarr;</span>
  </a>
  <div class="sticky top-0 z-40">
  <header class="w-full border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
    <nav aria-label="Global"
         class="container max-w-6xl h-14 flex items-center justify-between gap-6">
      <div class="flex">
        <NuxtLink href="/"
                  class="flex items-center hover:opacity-90 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <img src="/brand/lockup-horizontal-white.avif"
               alt="Aruna logo"
               class="h-7 w-auto"/>
        </NuxtLink>
      </div>

      <div id="navbar-alignment"
           class="hidden grow sm:block">
        <div class="flex items-center gap-7 text-sm">
          <NuxtLink
              class="font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              to="/explore">
            Search
          </NuxtLink>

          <NuxtLink
              class="font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              to="/news">
            News
          </NuxtLink>
          <!-- Dropdown Start -->
          <div class="hs-dropdown [--strategy:static] sm:[--strategy:fixed] [--adaptive:none]">
            <button id="hs-mega-menu-basic-dr" type="button"
                    class="flex items-center w-full font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              Docs
              <IconChevronDown class="ms-1 flex-shrink-0 size-4"/>
            </button>

            <div
                class="hs-dropdown-menu transition-[opacity,margin] duration-[0.1ms] sm:duration-[150ms] hs-dropdown-open:opacity-100 opacity-0 sm:w-48 z-10 sm:shadow-md rounded-lg p-1.5 bg-popover border-border divide-aruna-text/50 before:absolute top-full sm:border before:-top-5 before:start-0 before:w-full before:h-5 hidden">
              <NuxtLink :to="devInstance ? 'https://api.dev.aruna-engine.org' : 'https://api.aruna-engine.org'"
                        class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-aruna-text hover:bg-accent hover:text-foreground focus:ring-1 focus:ring-ring"
                        target="_blank">
                API
              </NuxtLink>
              <NuxtLink href="https://docs.aruna-engine.org/latest/get_started/basic_usage/00_index/"
                        class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-aruna-text hover:bg-accent hover:text-foreground focus:ring-1 focus:ring-ring"
                        target="_blank">
                Getting Started
              </NuxtLink>
              <NuxtLink href="https://docs.aruna-engine.org/latest/internal_data_structure/internal_data_structure/"
                        class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-aruna-text hover:bg-accent hover:text-foreground focus:ring-1 focus:ring-ring"
                        target="_blank">
                Data Structure
              </NuxtLink>
            </div>
          </div>
          <!-- Dropdown End -->

          <NuxtLink href="https://github.com/arunaengine"
                    aria-label="GitHub"
                    class="font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    target="_blank">
            <IconBrandGithub class="flex-shrink-0 size-4"/>
          </NuxtLink>
        </div>
      </div>

      <div class="flex items-center gap-x-2">
        <a href="https://v3.aruna-engine.org"
           target="_blank"
           rel="noopener"
           class="hidden lg:inline-flex items-center gap-x-1.5 h-8 px-3 rounded-md border border-aruna-tagline/40 bg-aruna-tagline/10 text-sm font-medium text-aruna-tagline transition-colors hover:bg-aruna-tagline/20">
          Test Aruna V3
          <IconArrowUpRight class="size-3.5"/>
        </a>
        <details class="relative sm:hidden">
          <summary aria-label="Menu"
                   class="flex size-8 cursor-pointer list-none items-center justify-center rounded-md border border-input hover:bg-accent [&::-webkit-details-marker]:hidden">
            <IconMenu2 class="size-4"/>
          </summary>
          <div class="absolute end-0 top-10 z-50 w-48 rounded-lg border border-border bg-popover p-1.5 shadow-lg">
            <NuxtLink to="/explore" class="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">Search</NuxtLink>
            <NuxtLink to="/news" class="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">News</NuxtLink>
            <a href="https://docs.aruna-engine.org/latest" target="_blank" rel="noopener" class="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">Documentation</a>
            <a href="https://github.com/arunaengine" target="_blank" rel="noopener" class="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">GitHub</a>
            <a href="https://v3.aruna-engine.org" target="_blank" rel="noopener" class="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground text-aruna-tagline">Aruna V3 (testing)</a>
          </div>
        </details>
        <ClientOnly>
          <div>
            <DropdownMenu v-if="user_state">
              <DropdownMenuTrigger class="h-8 px-3 flex items-center justify-center gap-x-2 rounded-md border border-input text-sm font-medium hover:bg-accent">
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
                        <NuxtLink :to="devInstance ? 'https://api.dev.aruna-engine.org' : 'https://api.aruna-engine.org'"
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
  </div>
</template>
