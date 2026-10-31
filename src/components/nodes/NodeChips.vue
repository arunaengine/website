<script setup lang="ts">
// The nodes a bucket is stored on, as in the Data header: up to two by name, more in one menu.
import { RouterLink } from 'vue-router'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { ChevronDown, Server } from '@lucide/vue'

defineProps<{ nodes: string[] }>()
const { displayName } = useRealmNodes()
const NODE_CHIP = 'inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border-subtle px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground'
</script>

<template>
  <span v-if="nodes.length" class="inline-flex flex-wrap items-center gap-1.5" aria-label="Stored on">
    <template v-if="nodes.length <= 2">
      <RouterLink
        v-for="id in nodes"
        :key="id"
        :to="{ name: 'node', params: { nodeId: id } }"
        :class="NODE_CHIP"
        :title="`Open ${displayName(id)}`"
      >{{ displayName(id) }}</RouterLink>
    </template>
    <DropdownMenu v-else>
      <DropdownMenuTrigger as-child>
        <button type="button" :class="NODE_CHIP">{{ nodes.length }}&nbsp;nodes <ChevronDown class="h-3 w-3" aria-hidden="true" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-56">
        <DropdownMenuLabel>Stored on {{ nodes.length }}&nbsp;nodes</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem v-for="id in nodes" :key="id" as-child>
          <RouterLink :to="{ name: 'node', params: { nodeId: id } }"><Server class="h-3.5 w-3.5" /> {{ displayName(id) }}</RouterLink>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </span>
</template>
