<script setup lang="ts">
// Whether this computer runs jobs, and the address workflow tools send them to.
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { tesAddress } from '@/lib/toolSnippets'
import { ArrowRight, Laptop } from '@lucide/vue'

const { compute, state, ensureLoaded } = useDeviceCompute()
const { status } = useDeviceStatus()

// The address only counts while the node itself answers.
const tes = computed(() =>
  status.value?.state === 'running' && status.value.ready ? tesAddress(status.value.apiBaseUrl) : null,
)
const summary = computed(() => {
  const current = compute.value
  if (state.value !== 'ready' || !current) {
    return state.value === 'idle' || state.value === 'loading' ? 'Reading…' : 'Not available right now'
  }
  if (!current.enabled) return 'Turn it on to run your own jobs next to your data.'
  const limit = current.limits.max_concurrent
  return [current.backend, limit ? `${limit} ${limit === 1 ? 'job' : 'jobs'} at a time` : null, `${current.running} running now`]
    .filter(Boolean)
    .join(' · ')
})

onMounted(() => void ensureLoaded())
</script>

<template>
  <section class="surface overflow-hidden">
    <div class="flex flex-wrap items-center gap-3 px-5 py-3">
      <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-aruna-royal/10 text-aruna-royal">
        <Laptop class="h-4 w-4" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-foreground">
            {{ compute?.enabled ? 'This computer runs jobs' : 'This computer runs no jobs' }}
          </span>
          <Badge v-if="compute" :variant="compute.enabled ? 'success' : 'secondary'" size="sm">
            {{ compute.enabled ? 'On' : 'Off' }}
          </Badge>
        </div>
        <p class="text-xs text-muted-foreground">{{ summary }}</p>
      </div>
      <Button variant="ghost" size="sm" as-child>
        <RouterLink :to="{ name: 'device', query: { section: 'local-runs' } }">
          Change limits <ArrowRight class="h-3.5 w-3.5" />
        </RouterLink>
      </Button>
    </div>
    <div
      v-if="compute?.enabled"
      class="flex flex-wrap items-center gap-3 border-t border-border bg-muted/20 px-5 py-2.5 text-xs"
    >
      <span class="font-medium text-foreground">Nextflow and Snakemake</span>
      <code v-if="tes" class="surface-muted flex min-w-0 items-center gap-2 px-2.5 py-1 font-mono text-[11px]">
        <span class="truncate">{{ tes }}</span>
        <CopyButton :value="tes" label="Copy address" />
      </code>
      <span v-else class="text-muted-foreground">Start Aruna to get an address.</span>
      <RouterLink :to="{ name: 'settings', query: { tab: 'access' } }" class="font-medium text-primary hover:underline">
        Set up
      </RouterLink>
    </div>
  </section>
</template>
