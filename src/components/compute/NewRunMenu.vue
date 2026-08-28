<script setup lang="ts">
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import type { ButtonVariants } from '@/components/ui/button'
import { ChevronDown, ListPlus, Play, Zap } from '@lucide/vue'

defineProps<{
  size?: ButtonVariants['size']
  variant?: ButtonVariants['variant']
}>()

const router = useRouter()

function goQuick() {
  void router.push({ name: 'compute-quick' })
}

function goNew() {
  void router.push({ name: 'compute-new' })
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button :size="size" :variant="variant">
        <Play class="h-4 w-4" /> New run <ChevronDown class="h-3.5 w-3.5 opacity-70" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-80 p-1.5">
      <DropdownMenuItem class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5" @click="goQuick">
        <Zap class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span class="min-w-0">
          <span class="block text-sm font-medium text-foreground">Quick run</span>
          <span class="block text-xs leading-relaxed text-muted-foreground">Write a short script, the portal stages it and builds the TES task for you.</span>
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5" @click="goNew">
        <ListPlus class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span class="min-w-0">
          <span class="block text-sm font-medium text-foreground">New task</span>
          <span class="block text-xs leading-relaxed text-muted-foreground">Describe a full GA4GH TES task by hand, image, command, resources.</span>
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
