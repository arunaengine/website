<script setup lang="ts">
// PyPI or npm dependencies of a quick run, each checked against its registry.
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { injectQuickRun } from '@/composables/useQuickRun'
import { VERIFICATION_LABEL } from '@/lib/quickDependencies'
import { Plus, X } from '@lucide/vue'

const {
  runtimeId,
  dependencies,
  dependencyDraft,
  dependencyError,
  dependencyVerification,
  addDependency,
  removeDependency,
} = injectQuickRun()
</script>

<template>
  <p class="max-w-2xl rounded-md border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
    Added dependencies are checked against the registry automatically (browser-only, nothing is started); uv or Deno still performs the authoritative resolution when the run starts.
  </p>
  <div class="max-w-2xl space-y-2">
    <label class="text-xs font-medium text-foreground">
      {{ runtimeId === 'python-uv' ? 'PyPI requirement' : 'npm package' }}
    </label>
    <div class="flex items-center gap-2">
      <Input
        v-model="dependencyDraft"
        class="font-mono text-xs"
        :placeholder="runtimeId === 'python-uv' ? 'requests>=2' : 'chalk@5'"
        :invalid="dependencyError ? 'error' : undefined"
        @keyup.enter.prevent="addDependency"
      />
      <Button size="sm" :disabled="!dependencyDraft.trim() || !!dependencyError" @click="addDependency">
        <Plus class="size-3.5" /> Add
      </Button>
    </div>
    <p v-if="dependencyError" class="text-[11px] text-destructive">{{ dependencyError }}</p>
    <p v-else class="text-[11px] text-muted-foreground">
      <template v-if="runtimeId === 'python-uv'">
        Requirements are stored as hidden PEP 723 metadata in the uploaded script; the editor stays unchanged.
      </template>
      <template v-else>
        Packages are mapped to bare imports, for example <code class="rounded bg-muted px-1 font-mono">import chalk from "chalk"</code>.
      </template>
    </p>
  </div>

  <ul v-if="dependencies.length" class="max-w-2xl space-y-2">
    <li
      v-for="(dependency, index) in dependencies"
      :key="dependency"
      class="surface-inline flex items-center gap-2 px-3 py-2 text-xs"
    >
      <code class="min-w-0 flex-1 truncate font-mono text-foreground">{{ dependency }}</code>
      <Badge
        v-if="dependencyVerification[dependency]"
        :variant="dependencyVerification[dependency].state === 'not-found' ? 'destructive' : dependencyVerification[dependency].state === 'available' ? 'success' : 'outline'"
        size="sm"
        class="shrink-0"
        :title="dependencyVerification[dependency].detail"
      >
        {{ VERIFICATION_LABEL[dependencyVerification[dependency].state] }}
      </Badge>
      <Button
        variant="ghost"
        size="icon-sm"
        :aria-label="`Remove ${dependency}`"
        @click="removeDependency(index)"
      >
        <X class="size-3" />
      </Button>
    </li>
  </ul>
  <p v-else class="text-xs text-muted-foreground">No extra dependencies. Standard library modules remain available.</p>
</template>
