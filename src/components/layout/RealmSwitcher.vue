<script setup lang="ts">
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import { useRealm } from '@/composables/useRealm'
import { truncateMiddle } from '@/lib/utils'
import { Check, ChevronsUpDown, Globe2 } from '@lucide/vue'

const { realm, realmDisplayName, realmId, activeRealmId, accessibleRealms, myMemberships, setRealm } = useRealm()

function roleOf(id: string) {
  return myMemberships.value.find((m) => m.realmId === id)?.role
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        class="group inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-2 text-left text-sm shadow-sm transition-colors hover:border-primary/40 hover:bg-card"
      >
        <span
          class="grid h-6 w-6 shrink-0 place-items-center rounded text-white"
          :style="{ backgroundColor: realm.color }"
        >
          <Globe2 class="h-3.5 w-3.5" />
        </span>
        <span class="flex min-w-0 flex-col leading-none">
          <span class="truncate text-[9px] font-semibold uppercase leading-none tracking-wider text-muted-foreground">
            Active realm
          </span>
          <span class="mt-0.5 truncate text-[13px] font-semibold leading-none text-foreground" :title="realmId">
            {{ realmDisplayName }}
          </span>
        </span>
        <ChevronsUpDown class="ml-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-72">
      <DropdownMenuLabel>Switch realm</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        v-for="r in accessibleRealms"
        :key="r.id"
        @click="setRealm(r.id)"
        class="flex items-start gap-3"
      >
        <span
          class="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background"
          :style="{ backgroundColor: r.color }"
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate text-sm font-medium text-foreground">{{ r.name }}</span>
            <span
              v-if="roleOf(r.id)"
              class="shrink-0 rounded bg-muted px-1 py-[1px] font-mono text-[9px] uppercase tracking-wide text-muted-foreground"
            >
              {{ roleOf(r.id)?.replace('realm-', '') }}
            </span>
          </div>
          <div class="truncate font-mono text-[10px] text-muted-foreground" :title="r.id">
            {{ truncateMiddle(r.id, 12, 8) }}
          </div>
        </div>
        <Check v-if="r.id === activeRealmId" class="mt-1 h-3.5 w-3.5 shrink-0 text-primary" />
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <div class="flex items-center gap-1.5 px-2 py-1.5">
        <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Realm id</span>
        <code class="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-muted-foreground" :title="realmId">
          {{ realmId }}
        </code>
        <CopyButton :value="realmId" label="Copy realm id" />
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuLabel class="text-[10px] font-normal text-muted-foreground">
        The portal scopes every view (data, groups, metadata, query) to the selected realm.
      </DropdownMenuLabel>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
