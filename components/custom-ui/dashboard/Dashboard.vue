<script lang="ts" setup>
import {
  IconAffiliate,
  IconBell,
  IconDeviceDesktopAnalytics,
  IconHome,
  IconChartLine,
  IconFingerprint,
  IconId,
  IconLogout,
  IconMenu2,
  IconPackage,
  IconPolygon,
  IconSearch,
  IconUserCircle,
} from '@tabler/icons-vue'

import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {Input} from '@/components/ui/input'
import {Sheet, SheetContent, SheetTrigger} from '@/components/ui/sheet'

import OverviewStats from "~/components/custom-ui/dashboard/OverviewStats.vue";
import FileExplorer from "~/components/custom-ui/dashboard/FileExplorer.vue";
import Realms from "~/components/custom-ui/dashboard/Realms.vue";
import DummyAnalytics from "~/components/custom-ui/dashboard/DummyAnalytics.vue";
import ResourceCreation from "~/components/custom-ui/ResourceCreation.vue";
import RealmSwitcher from "~/components/custom-ui/dashboard/RealmSwitcher.vue";
import Events from "~/components/custom-ui/dashboard/Events.vue";
import Profile from "~/components/custom-ui/user/Profile.vue";
import Tokens from "~/components/custom-ui/user/Tokens.vue";
import Proxies from "~/components/custom-ui/user/Proxies.vue";
import SearchBar from "~/components/custom-ui/SearchBar.vue";

import type {User} from '~/composables/api_wrapper'
import {toast} from "~/components/ui/toast";
import {useStats} from "~/composables/Stats";
import {useRealms} from "~/composables/Realms";
import {useGroups} from "~/composables/Groups";
import {useProjects} from "~/composables/Projects";
import {useTokens} from "~/composables/Tokens";
import {useEvents} from "~/composables/Events";


const props = defineProps<{
  user: User | undefined
}>()
const user = toRef(() => props.user)
const user_id = toRef(() => user.value?.id)

watch(user, () => console.log('[Dashboard Component]', `User got updated: ${user.value ? user.value.id : 'Undefined'}`))
watch(user_id, () => console.log('[Dashboard Component]', `User Id updated: ${user_id.value}`))

const route = useRoute()
const tab = route.query.tab

const endpoints = ref([]) //await fetchEndpoints() TODO

const {events, refreshEvents} = await useEvents([user], user_id)
const {realms, refreshRealms} = await useRealms()
const {groups, refreshGroups} = await useGroups()
const {tokens, refreshTokens} = await useTokens()
const {projects, refreshProjects} = await useProjects()
const {stats, refreshStats} = await useStats([]) //await useStats([realms, groups, projects])

watch(realms, () => console.log('[Dashboard] Realms updated to value:', realms.value))
watch(groups, () => console.log('[Dashboard] Groups updated to value:', groups.value))
watch(events, () => console.log('[Dashboard] Events updated to value:', events.value))

EventBus.on('updateStats', async () => await refreshStats())
EventBus.on('updateRealms', async () => await refreshRealms())
EventBus.on('updateGroups', async () => await refreshGroups())
EventBus.on('updateProjects', async () => await refreshProjects())

const unreadEvents = computed(() => events.value ? events.value.length : 0)

/* ----- DASHBOARD CONTENT ----- */
const currentContent: Ref<string> = ref(tab as string || 'OverviewStats')
const contentComponents = {
  'Events': {component: Events},
  'OverviewStats': {component: OverviewStats},
  'FileExplorer': {component: FileExplorer},
  'ResourceCreation': {component: ResourceCreation},
  'Realms': {component: Realms},
  'DummyAnalytics': {component: DummyAnalytics},
  'Profile': {component: Profile},
  'Tokens': {component: Tokens,},
  'Proxies': {component: Proxies},
}
const componentProps = computed(() => {
  switch (currentContent.value) {
    case 'OverviewStats':
      return stats.value
    case 'Events':
      return {
        events: events.value,
        navCollapsedSize: 4
      }
    case 'FileExplorer':
      return {
        resources: projects.value
      }
    case 'ResourceCreation':
      return {
        realms: realms.value,
        groups: groups.value
      }
    case 'Profile':
      return {
        user: user.value,
        groups: groups.value
      }
    case 'Tokens':
      return {
        tokens: tokens.value
      }
    case 'Proxies':
      return {
        userEndpoints: [], //TODO
        endpoints: [], //TODO
      }
    default:
      return {}
  }
})

/* ----- EXTERNAL TAB SWITCH ----- */
function setTab(tabId: string) {
  currentContent.value = tabId
}

EventBus.on('setTab', (tabId: string) => setTab(tabId))
/* ----- END EXTERNAL TAB SWITCH ----- */

/* ----- REALM SWITCH ----- */
function addRealm(realm: Realm) {
  if (realms.value)
    realms.value.push(realm)
  else
    realms.value = [realm]
}

function setRealm(realmId: string) {
  //ToDo: Re-fetch things
  console.log('[Dashboard Component]', `Switched realm to: ${realmId}`)
  toast({
    title: 'Info',
    description: `Switched realm to: ${realmId}`
  })
}

EventBus.on('switchRealm', (realmId: string) => setRealm(realmId))
/* ----- END REALM SWITCH ----- */

const spinBaby = ref(false)
EventBus.on('spinStart', () => spinBaby.value = true)
EventBus.on('spinStop', () => spinBaby.value = false)
</script>

<template>
  <!--<div class="grid h-full min-h-[calc(100vh-64px)] w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">-->
  <div class="grid h-full min-h-[calc(100vh-64px)] w-full md:grid-cols-[220px_1fr]">
    <div class="hidden border-r bg-aruna-bg/90 md:block">
      <div class="flex h-full max-h-screen flex-col gap-2">
        <div class="flex items-center justify-between border-b px-4 lg:h-[60px] lg:px-6">
          <div class="flex space-x-2">
            <img alt="Aruna logo"
                 class="inline w-24 h-auto align-middle hover:cursor-pointer"
                 src="/imgs/aruna_dark.webp"
                 @click="currentContent = 'OverviewStats'"/>
          </div>

          <div class="flex relative">
            <Button key="Events"
                    :class="[{'bg-muted': currentContent === 'Events', 'text-primary': currentContent === 'Events' }]"
                    class="ml-auto h-8 w-8"
                    size="icon"
                    variant="outline"
                    @click="currentContent = 'Events'">
              <IconBell class="h-4 w-4"/>
              <span class="sr-only">Toggle events</span>
            </Button>
            <Badge v-if="unreadEvents > 0"
                   class="absolute animate-bounce -bottom-1 -right-1 -mb-1 -mr-1 bg-red-400 hover:bg-red-400 text-white text-xs font-bold w-4 h-4 flex items-center justify-center rounded-full">
              {{ unreadEvents }}
            </Badge>
          </div>
        </div>

        <!-- Side Navigation -->
        <div class="flex-1">
          <nav class="grid items-start px-2 text-sm font-medium lg:px-4">
            <button key="OverviewStats"
                    :class="{'bg-aruna-fg text-aruna-text-accent': currentContent === 'OverviewStats'}"
                    class="flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-aruna-text hover:text-aruna-text-accent"
                    @click="currentContent='OverviewStats'">
              <IconHome class="h-4 w-4"/>
              Overview
            </button>

            <button key="Realms"
                    :class="{'bg-aruna-fg text-aruna-text-accent': currentContent === 'Realms'}"
                    class="flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-aruna-text hover:text-aruna-text-accent"
                    @click="currentContent = 'Realms'">
              <IconAffiliate class="h-5 w-5"/>
              Realms
            </button>

            <button key="DummyStats"
                    :class="{'bg-aruna-fg text-aruna-text-accent': currentContent === 'DummyStats'}"
                    class="flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-aruna-text hover:text-aruna-text-accent"
                    @click="currentContent = 'DummyStats'">
              <IconDeviceDesktopAnalytics class="h-4 w-4"/>
              Stats
            </button>

            <button key="DummyAnalytics"
                    :class="{'bg-aruna-fg text-aruna-text-accent': currentContent === 'DummyAnalytics'}"
                    class="flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-aruna-text hover:text-aruna-text-accent"
                    @click="currentContent = 'DummyAnalytics'">
              <IconChartLine class="h-4 w-4"/>
              Analytics
            </button>

            <button key="FileExplorer"
                    :class="{'bg-aruna-fg text-aruna-text-accent': currentContent === 'FileExplorer'}"
                    class="flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-aruna-text hover:text-aruna-text-accent"
                    @click="currentContent = 'FileExplorer'">
              <IconPackage class="h-5 w-5"/>
              Resources
            </button>

            <Separator class="my-4 bg-slate-300 dark:bg-slate-400"/>

            <button key="Profile"
                    :class="{'bg-aruna-fg text-aruna-text-accent': currentContent === 'Profile'}"
                    class="flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-aruna-text hover:text-aruna-text-accent"
                    @click="currentContent = 'Profile'">
              <IconId class="h-4 w-4"/>
              Profile
            </button>

            <button key="Tokens"
                    :class="{'bg-aruna-fg text-aruna-text-accent': currentContent === 'Tokens'}"
                    class="flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-aruna-text hover:text-aruna-text-accent"
                    @click="currentContent = 'Tokens'">
              <IconFingerprint class="h-4 w-4"/>
              Tokens
            </button>

            <button key="Proxies"
                    :class="{'bg-aruna-fg text-aruna-text-accent': currentContent === 'Proxies'}"
                    class="flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-aruna-text hover:text-aruna-text-accent"
                    @click="currentContent = 'Proxies'">
              <IconPolygon class="h-4 w-4"/>
              Data Proxies
            </button>
          </nav>
        </div>
        <!-- End Side Navigation -->
      </div>
    </div>

    <!-- Sidebar for mobile devices -->
    <div class="flex flex-col">
      <header class="flex items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
        <Sheet>
          <SheetTrigger as-child>
            <Button class="shrink-0 md:hidden"
                    size="icon"
                    variant="outline">
              <IconMenu2 class="h-5 w-5"/>
              <span class="sr-only">Toggle navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent class="flex flex-col" side="left">
            <nav class="grid gap-2 text-lg font-medium">
              <a class="flex items-center gap-2 text-lg font-semibold"
                 href="/user/dashboard">
                <img alt="Aruna logo"
                     class="inline w-24 h-auto align-middle"
                     src="/imgs/aruna_dark.webp"/>
              </a>
              <a class="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
                 href="#">
                <IconHome class="h-5 w-5"/>
                Overview
              </a>
              <a class="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
                 href="#">
                <IconPackage class="h-5 w-5"/>
                Resources
                <Badge class="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                  6
                </Badge>
              </a>
              <a class="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
                 href="#">
                <IconChartLine class="h-5 w-5"/>
                Analytics
              </a>
            </nav>
          </SheetContent>
        </Sheet>

        <div class="flex flex-col sm:flex-row w-full space-x-4">
          <ClientOnly fallbackTag="span">
            <RealmSwitcher class="flex"
                           :realms="realms"
                           @add-realm="addRealm" />
            <template #fallback>
              <Skeleton class="h-auto w-[300px]"/>
            </template>
          </ClientOnly>
          <SearchBar />
        </div>
        <DropdownMenu>
          <ClientOnly fallbackTag="span">
            <DropdownMenuTrigger as-child>
              <Button class="rounded-full" size="icon" variant="secondary">
                <IconUserCircle class="h-5 w-5"/>
                <span class="sr-only">Toggle user menu</span>
              </Button>
            </DropdownMenuTrigger>
            <template #fallback>
              <Skeleton class="h-9 w-9 rounded-full"/>
            </template>
          </ClientOnly>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel v-if="user" class="text-md text-aruna-700">
              {{ user.first_name }} {{ user.last_name }}
            </DropdownMenuLabel>
            <DropdownMenuLabel v-if="user" class="text-sm text-slate-500">
              {{ user.email }}
            </DropdownMenuLabel>
            <DropdownMenuSeparator v-if="user"/>
            <DropdownMenuItem>
              <a v-if="!user" href="/auth/login?provider=local">
                <IconLogout class="inline-flex h-4 w-4 me-2"/>
                Login
              </a>
              <a v-else href="/auth/logout">
                <IconLogout class="inline-flex h-4 w-4 me-2"/>
                Logout
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main class="flex flex-1 flex-col gap-4 lg:gap-6 bg-[#080d1f]/[.9]">
        <KeepAlive>
          <component :is="contentComponents[currentContent].component" v-bind="componentProps"/>
        </KeepAlive>
      </main>
    </div>
    <!-- END Sidebar for mobile devices -->

  </div>
</template>