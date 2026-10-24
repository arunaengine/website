<script setup lang="ts">
// Every node checks a read for itself, so a grant on this bucket names every node with *.
import CopyButton from '@/components/ui/CopyButton.vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import type { LiveState } from '@/lib/distribution'
import { KeyRound } from '@lucide/vue'

defineProps<{ live: LiveState }>()
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <KeyRound class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Grants on every node</h2>
      <StorageFeatureLink icon question="nodes" />
    </header>
    <div class="space-y-2 px-5 py-4 text-xs text-muted-foreground">
      <p>A read that pulls from another node is checked on that node. Use * for the node, so the grant reaches every node.</p>
      <p>
        <code class="break-all rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">{{ live.recommendedGrant }}</code>
        <CopyButton :value="live.recommendedGrant" label="Copy the node glob" class="ml-1 align-middle" />
      </p>
    </div>
  </section>
</template>
