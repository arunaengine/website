<script setup lang="ts">
import {IconActivity} from '@tabler/icons-vue'

/* ----- PROPERTIES ----- */
interface OverviewStatsProps {
  projects?: number
  realms?: number
  resources?: number
  storage?: number
  users?: number
}
const {projects, realms, resources, storage, users} = defineProps<OverviewStatsProps>()
/* ----- END PROPERTIES ----- */

function emitTabSwitch(tabId: string) {
  EventBus.emit('setTab', tabId);
}
</script>

<template>
  <!--<div class="flex flex-1 items-center justify-center rounded-md border border-dashed border-slate-500 shadow-sm">-->
  <div class="mx-4 mt-4 flex flex-1 flex-col rounded-md border border-dashed border-slate-500 shadow-sm">
    <div class="flex flex-col my-6">
      <div class="grid gap-4 p-4 md:grid-cols-2 md:gap-8 lg:grid-cols-5">
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">
              Total number of realms
            </CardTitle>
            <IconActivity class="h-4 w-4 text-muted-foreground"/>
          </CardHeader>
          <CardContent class="space-y-2">
            <div class="text-2xl font-bold">
              {{ realms || '-' }}
            </div>
            <p class="text-xs text-muted-foreground">
              Nothing changed since last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">
              Total storage left in realms
            </CardTitle>
            <IconActivity class="h-4 w-4 text-muted-foreground"/>
          </CardHeader>
          <CardContent class="space-y-2">
            <div class="text-2xl font-bold">
              {{ storage ? formatBytes(+storage) : 'N/A' }}
            </div>
            <p class="text-xs text-muted-foreground">
              -12.4% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">
              Total projects in realms
            </CardTitle>
            <IconActivity class="h-4 w-4 text-muted-foreground"/>
          </CardHeader>
          <CardContent class="space-y-2">
            <div class="text-2xl font-bold">
              {{ projects || '-' }}
            </div>
            <p class="text-xs text-muted-foreground">
              +2 more than last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">
              Total resources in realms
            </CardTitle>
            <IconActivity class="h-4 w-4 text-muted-foreground"/>
          </CardHeader>
          <CardContent class="space-y-2">
            <div class="text-2xl font-bold">
              {{ resources || '-' }}
            </div>
            <p class="text-xs text-muted-foreground">
              +256 more than last month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">
              Total users in realms
            </CardTitle>
            <IconActivity class="h-4 w-4 text-muted-foreground"/>
          </CardHeader>
          <CardContent class="space-y-2">
            <div class="text-2xl font-bold">
              {{ users || '-' }}
            </div>
            <p class="text-xs text-muted-foreground">
              +4 from last month
            </p>
          </CardContent>
        </Card>

      </div>
    </div>

    <hr class="m-4"/>

    <div class="flex items-center justify-center gap-y-6 gap-x-1">
      Wanna create or join a group? Take a look at your
      <span class="font-bold text-aruna-highlight hover:text-aruna-highlight/80"
            @click="emitTabSwitch('Profile')">
        profile
      </span>.
    </div>
  </div>
</template>