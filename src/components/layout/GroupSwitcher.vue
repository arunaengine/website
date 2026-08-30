<script setup lang="ts">
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import { useAruna } from '@/composables/useAruna'
import { activeGroupId, setActiveGroup } from '@/composables/useGroupSelection'
import { truncateMiddle } from '@/lib/utils'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Check, ChevronsUpDown, Users } from '@lucide/vue'

const { currentUser, myGroups } = useAruna()

const activeGroup = computed(() => myGroups.value.find((group) => group.id === activeGroupId.value))
</script>

<template>
  <DropdownMenu v-if="currentUser && myGroups.length">
    <DropdownMenuTrigger as-child>
      <button
        class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-2 text-left text-sm shadow-sm transition-colors hover:border-primary/40"
        aria-label="Switch group"
      >
        <span class="grid h-6 w-6 shrink-0 place-items-center rounded bg-primary/10 text-primary">
          <Users class="h-3.5 w-3.5" />
        </span>
        <!-- Below sm the crowded row keeps the tile only. -->
        <span class="hidden min-w-0 flex-col leading-none sm:flex">
          <span class="truncate text-[9px] font-semibold uppercase leading-none tracking-wider text-muted-foreground">
            Active group
          </span>
          <span
            class="mt-0.5 max-w-32 truncate text-[13px] font-semibold leading-none text-foreground"
            :title="activeGroupId"
          >
            {{ activeGroup?.name || activeGroupId }}
          </span>
        </span>
        <ChevronsUpDown class="ml-0.5 hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-72">
      <DropdownMenuLabel>Switch group</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        v-for="group in myGroups"
        :key="group.id"
        @click="setActiveGroup(group.id)"
        class="flex items-start gap-3"
      >
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium text-foreground">{{ group.name }}</div>
          <div class="truncate font-mono text-[10px] text-muted-foreground" :title="group.id">
            {{ truncateMiddle(group.id, 12, 8) }}
          </div>
        </div>
        <Check v-if="group.id === activeGroupId" class="mt-1 h-3.5 w-3.5 shrink-0 text-primary" />
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <div class="flex items-center gap-1.5 px-2 py-1.5">
        <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Group id</span>
        <code
          class="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-muted-foreground"
          :title="activeGroupId"
        >
          {{ activeGroupId }}
        </code>
        <CopyButton :value="activeGroupId" label="Copy group id" />
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem as-child>
        <RouterLink :to="{ name: 'groups' }" class="flex w-full items-center gap-2">
          <Users class="h-3.5 w-3.5 text-muted-foreground" /> Manage groups
        </RouterLink>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
