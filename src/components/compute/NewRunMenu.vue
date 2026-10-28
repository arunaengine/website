<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import MyRunsDialog from '@/components/compute/MyRunsDialog.vue'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import { useSavedRuns } from '@/composables/useSavedRuns'
import { askedFor } from '@/lib/savedRuns'
import type { ButtonVariants } from '@/components/ui/button'
import { Braces, ChevronDown, FileCode2, FileTerminal, ListPlus, Play, Star } from '@lucide/vue'

defineProps<{
  size?: ButtonVariants['size']
  variant?: ButtonVariants['variant']
}>()

const router = useRouter()
const saved = useSavedRuns()
const managing = ref(false)

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
      <template v-if="saved.runs.value.length">
        <DropdownMenuLabel class="px-2.5 text-xs text-muted-foreground">My runs</DropdownMenuLabel>
        <DropdownMenuItem
          v-for="run in saved.runs.value"
          :key="run.id"
          class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2"
          @click="router.push({ name: 'compute-new', query: { saved: run.id } })"
        >
          <Star class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span class="min-w-0">
            <span class="block text-sm font-medium text-foreground">{{ run.name }}</span>
            <span v-if="askedFor(run).length" class="block text-xs text-muted-foreground">Asks for: {{ askedFor(run).join(', ') }}</span>
          </span>
        </DropdownMenuItem>
      </template>
      <DropdownMenuItem class="cursor-pointer px-2.5 py-1.5 text-xs text-muted-foreground" @click="managing = true">Manage my runs…</DropdownMenuItem>
      <DropdownMenuSeparator />
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
  <MyRunsDialog v-model:open="managing" />
</template>
