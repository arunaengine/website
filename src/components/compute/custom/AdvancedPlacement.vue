<script setup lang="ts">
// Run options the GA4GH task interface cannot carry; setting any of them sends
// the run through the native jobs API instead.
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import { COLLISION_OPTIONS, INPUT_MODE_OPTIONS, injectCustomRun } from '@/composables/useCustomRun'
import type { InputModeRequest } from '@/lib/jobs'
import { Plus, X } from '@lucide/vue'

const {
  advancedInputs,
  collisionPolicy,
  nativeInvalid,
  nativeUnsupported,
  outputPrefixes,
  placementFor,
  setInputMode,
  setInputVersion,
  addOutputPrefix,
  removeOutputPrefix,
} = injectCustomRun()
</script>

<template>
  <div data-tutorial="run-placement" class="space-y-3 border-t border-border pt-6">
    <div>
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Advanced placement</h2>
      <p class="mt-1 text-[11px] text-muted-foreground">
        The standard run interface cannot carry these. Setting any of them sends the run
        through Aruna's own jobs API instead, which is what makes them take effect.
      </p>
    </div>

    <Notice v-if="nativeUnsupported" tone="warning">
      These options are unavailable for this draft: {{ nativeUnsupported }}
    </Notice>

    <fieldset v-else class="space-y-4" :disabled="!!nativeUnsupported">
      <div v-if="advancedInputs.length" class="space-y-2">
        <div class="text-xs font-medium text-foreground">Input versions</div>
        <div
          v-for="input in advancedInputs"
          :key="input.path"
          class="surface-inline grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_12rem_minmax(0,1fr)]"
        >
          <div class="min-w-0 truncate font-mono text-[11px] text-foreground" :title="input.path">
            {{ input.path }}
          </div>
          <Select
            :model-value="placementFor(input.path).mode"
            :options="INPUT_MODE_OPTIONS"
            aria-label="Input composition mode"
            @update:model-value="setInputMode(input.path, String($event) as InputModeRequest)"
          />
          <Input
            v-if="placementFor(input.path).mode === 'exact_reference'"
            :model-value="placementFor(input.path).versionId ?? ''"
            class="font-mono"
            placeholder="Version id"
            aria-label="Input version id"
            @update:model-value="setInputVersion(input.path, String($event))"
          />
          <p v-else class="self-center text-[11px] text-muted-foreground">
            {{
              placementFor(input.path).mode === 'floating_reference'
                ? 'Resolved when the run starts.'
                : 'Copied as it is when the run starts.'
            }}
          </p>
        </div>
      </div>
      <p v-else class="text-[11px] text-muted-foreground">Add an input to choose how it is composed.</p>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="text-xs font-medium text-foreground">Collision policy</label>
          <Select v-model="collisionPolicy" :options="COLLISION_OPTIONS" class="mt-1" />
          <p class="mt-1 text-[11px] text-muted-foreground">
            What happens when two inputs stage onto the same key. Only Reject refuses them.
          </p>
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-foreground">Output prefixes</label>
          <p class="text-[11px] text-muted-foreground">
            Key prefixes inventoried when the run finishes. Only objects this run
            wrote are attributed to it.
          </p>
          <div
            v-for="(prefix, index) in outputPrefixes"
            :key="index"
            class="grid grid-cols-[minmax(0,1fr)_1.75rem] gap-x-2"
          >
            <Input
              :model-value="prefix"
              class="font-mono"
              placeholder="reports/"
              aria-label="Output prefix"
              @update:model-value="outputPrefixes[index] = String($event)"
            />
            <Button variant="ghost" size="icon-sm" class="self-center" aria-label="Remove output prefix" @click="removeOutputPrefix(index)">
              <X class="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" @click="addOutputPrefix">
            <Plus class="h-3.5 w-3.5" /> Add prefix
          </Button>
        </div>
      </div>

      <p v-if="nativeInvalid" class="text-[11px] text-destructive">{{ nativeInvalid }}</p>
    </fieldset>
  </div>
</template>
