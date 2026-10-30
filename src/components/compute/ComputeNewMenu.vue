<script setup lang="ts">
// The one New menu of Compute: a new run, the run templates, and a new notebook.
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import { useSavedRuns } from '@/composables/useSavedRuns'
import { RUN_TEMPLATES } from '@/lib/runTemplates'
import { ChevronDown, NotebookPen, Play, Plus, Star } from '@lucide/vue'

defineProps<{ notebooks?: boolean }>()

const router = useRouter()
const saved = useSavedRuns()
const templates = RUN_TEMPLATES.filter((entry) => entry.template)

function open(template: string) {
  void router.push({ name: 'compute-new', ...(template ? { query: { template } } : {}) })
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button size="sm"><Plus class="h-4 w-4" /> New <ChevronDown class="h-3.5 w-3.5" /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-64 p-1.5">
      <DropdownMenuItem class="cursor-pointer gap-2.5" @click="open('')"><Play class="h-4 w-4 text-muted-foreground" /> New run</DropdownMenuItem>
      <DropdownMenuLabel class="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">Run templates</DropdownMenuLabel>
      <DropdownMenuItem
        v-for="run in saved.runs.value"
        :key="run.id"
        class="cursor-pointer gap-2.5"
        @click="router.push({ name: 'compute-new', query: { saved: run.id } })"
      >
        <Star class="h-4 w-4 shrink-0 text-muted-foreground" /><span class="truncate">{{ run.name }}</span>
      </DropdownMenuItem>
      <DropdownMenuItem v-for="entry in templates" :key="entry.label" class="cursor-pointer gap-2.5" @click="open(entry.template)">
        <component :is="entry.icon" class="h-4 w-4 text-muted-foreground" /> {{ entry.label }}
      </DropdownMenuItem>
      <template v-if="notebooks">
        <DropdownMenuSeparator />
        <DropdownMenuItem class="cursor-pointer gap-2.5" @click="router.push({ name: 'compute', query: { tab: 'notebooks', new: '1' } })">
          <NotebookPen class="h-4 w-4 text-muted-foreground" /> New notebook
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
