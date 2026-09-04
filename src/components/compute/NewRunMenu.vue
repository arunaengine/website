<script setup lang="ts">
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import type { ButtonVariants } from '@/components/ui/button'
import { Braces, ChevronDown, FileCode2, FileTerminal, ListPlus, Play } from '@lucide/vue'

defineProps<{
  size?: ButtonVariants['size']
  variant?: ButtonVariants['variant']
}>()

const router = useRouter()

const TEMPLATES = [
  { template: 'python', icon: FileCode2, label: 'Python script', hint: 'uv runs it; packages come from PyPI.' },
  { template: 'javascript', icon: Braces, label: 'JavaScript script', hint: 'Deno runs it; packages come from npm.' },
  { template: 'bash', icon: FileTerminal, label: 'Bash script', hint: 'Plain shell, no extra tooling.' },
  { template: '', icon: ListPlus, label: 'Blank run', hint: 'Bring your own container image and command.' },
]

function open(template: string) {
  void router.push({ name: 'compute-new', ...(template ? { query: { template } } : {}) })
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
      <DropdownMenuItem
        v-for="entry in TEMPLATES"
        :key="entry.label"
        class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5"
        @click="open(entry.template)"
      >
        <component :is="entry.icon" class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span class="min-w-0">
          <span class="block text-sm font-medium text-foreground">{{ entry.label }}</span>
          <span class="block text-xs leading-relaxed text-muted-foreground">{{ entry.hint }}</span>
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
