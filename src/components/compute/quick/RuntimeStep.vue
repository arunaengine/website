<script setup lang="ts">
// Runtime preset and the working directory the whole run is anchored to.
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { injectQuickRun } from '@/composables/useQuickRun'
import { RUNTIMES } from '@/lib/quickRuntimes'

const { runtimeId, commandPreview, workdir, workdirValid, workdirNotice, setWorkdir } = injectQuickRun()
</script>

<template>
  <div class="space-y-3">
    <h2 class="font-display text-sm font-semibold text-aruna-navy">Runtime</h2>
    <div data-tour="quickrun-runtime" class="grid gap-3 sm:grid-cols-3">
      <button
        v-for="rt in RUNTIMES"
        :key="rt.id"
        type="button"
        class="rounded-lg border p-4 text-left transition-colors"
        :class="runtimeId === rt.id ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'border-border hover:bg-muted/40'"
        @click="runtimeId = rt.id"
      >
        <div class="text-sm font-semibold text-foreground">{{ rt.label }}</div>
        <div class="mt-0.5 text-[11px] text-muted-foreground">{{ rt.hint }}</div>
        <div class="mt-1 truncate font-mono text-[11px] text-muted-foreground" :title="rt.image">{{ rt.image }}</div>
      </button>
    </div>
    <p class="text-[11px] text-muted-foreground">
      The script runs as <code class="rounded bg-muted px-1 font-mono">{{ commandPreview }}</code> in a fresh container.
    </p>
    <div class="border-t border-border pt-3">
      <label class="text-xs font-medium text-foreground">Working directory <span class="text-muted-foreground">(advanced)</span></label>
      <Input
        :model-value="workdir"
        class="mt-1 w-56 font-mono"
        placeholder="/work"
        aria-label="Container working directory"
        :invalid="!workdirValid ? 'error' : undefined"
        @update:model-value="setWorkdir(String($event))"
      />
      <p v-if="!workdirValid" class="mt-1 text-[11px] text-destructive">
        Use an absolute canonical container directory other than /.
      </p>
      <p v-else class="mt-1 text-[11px] text-muted-foreground">
        The script runs here; inputs, captures and generated files default under it.
      </p>
      <Notice v-if="workdirNotice" tone="warning" class="mt-1">{{ workdirNotice }}</Notice>
    </div>
  </div>
</template>
