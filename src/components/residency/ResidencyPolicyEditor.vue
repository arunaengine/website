<script setup lang="ts">
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import {
  emptySelector,
  normalizeCreatePolicyRequest,
  placementPoliciesErrorMessage,
  policyCreationProblems,
} from '@/lib/placementPolicies'
import type { CreatePolicyRequest, PolicyResponse } from '@/lib/placementPolicies'
import { Plus, Send, Trash2 } from '@lucide/vue'

const { createPlacementPolicy } = usePlacementPolicies()

const draft = ref<CreatePolicyRequest>({ policy_id: '', name: '', allowed: [emptySelector()] })
const publishing = ref(false)
const publishError = ref<string | null>(null)
const published = ref<PolicyResponse | null>(null)
const problems = computed(() => policyCreationProblems(draft.value))

function addSelector() {
  draft.value.allowed.push(emptySelector())
}

function removeSelector(index: number) {
  draft.value.allowed.splice(index, 1)
}

function addLabel(selectorIndex: number) {
  draft.value.allowed[selectorIndex]?.labels.push({ key: '', value: '' })
}

function removeLabel(selectorIndex: number, labelIndex: number) {
  draft.value.allowed[selectorIndex]?.labels.splice(labelIndex, 1)
}

async function publish() {
  if (publishing.value || problems.value.length) return
  publishing.value = true
  publishError.value = null
  published.value = null
  try {
    published.value = await createPlacementPolicy(normalizeCreatePolicyRequest(draft.value))
    draft.value = { policy_id: '', name: '', allowed: [emptySelector()] }
  } catch (error) {
    publishError.value = placementPoliciesErrorMessage(error, 'create')
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <Notice tone="warning">
      Residency policies are immutable and digest-identified. Publishing a changed definition requires a new policy id.
    </Notice>

    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label class="text-xs font-medium text-foreground">Name</label>
        <Input v-model="draft.name" class="mt-1" placeholder="EU research data" />
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">Residency policy id (optional)</label>
        <Input v-model="draft.policy_id" class="mt-1 font-mono" placeholder="Mint automatically" />
        <p class="mt-1 text-[11px] text-muted-foreground">A caller-chosen id makes an identical retry idempotent.</p>
      </div>
    </div>

    <div>
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 class="text-xs font-semibold text-foreground">Allowed selectors</h4>
          <p class="mt-1 text-[11px] text-muted-foreground">
            Fields inside one selector are ANDed; multiple selectors are ORed. An empty selector is invalid.
          </p>
        </div>
        <Button size="sm" variant="outline" @click="addSelector"><Plus class="h-3.5 w-3.5" /> Add selector</Button>
      </div>

      <div class="mt-3 space-y-3">
        <div v-for="(selector, selectorIndex) in draft.allowed" :key="selectorIndex" class="rounded-lg border border-border bg-background p-4">
          <div class="mb-3 flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-foreground">Selector {{ selectorIndex + 1 }}</span>
              <Badge v-if="selectorIndex" variant="outline">OR</Badge>
            </div>
            <Button variant="ghost" size="icon-sm" class="text-destructive hover:text-destructive" :aria-label="`Remove selector ${selectorIndex + 1}`" @click="removeSelector(selectorIndex)">
              <Trash2 class="h-3.5 w-3.5" />
            </Button>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div>
              <label class="text-xs font-medium text-foreground">Node id</label>
              <Input v-model="selector.node_id" class="mt-1 font-mono text-xs" placeholder="Any node" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Location</label>
              <Input v-model="selector.location" class="mt-1" placeholder="Any location" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Executor kind</label>
              <Input v-model="selector.executor_kind" class="mt-1" placeholder="Any executor" />
            </div>
          </div>

          <div class="mt-4">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-foreground">Label matches</span>
              <Button size="sm" variant="ghost" @click="addLabel(selectorIndex)"><Plus class="h-3.5 w-3.5" /> Add label</Button>
            </div>
            <div v-if="selector.labels.length" class="mt-2 space-y-2">
              <div v-for="(label, labelIndex) in selector.labels" :key="labelIndex" class="flex items-center gap-2">
                <Input v-model="label.key" class="font-mono text-xs" :aria-label="`Label key ${labelIndex + 1} of selector ${selectorIndex + 1}`" placeholder="key" />
                <span class="text-muted-foreground">=</span>
                <Input v-model="label.value" class="font-mono text-xs" :aria-label="`Label value ${labelIndex + 1} of selector ${selectorIndex + 1}`" placeholder="value" />
                <Button variant="ghost" size="icon-sm" class="text-destructive hover:text-destructive" :aria-label="`Remove label ${labelIndex + 1} from selector ${selectorIndex + 1}`" @click="removeLabel(selectorIndex, labelIndex)">
                  <Trash2 class="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <p v-else class="mt-2 text-[11px] text-muted-foreground">No label constraint in this selector.</p>
          </div>
        </div>
      </div>
    </div>

    <ul v-if="problems.length" class="list-disc space-y-1 pl-5 text-xs text-destructive">
      <li v-for="problem in problems" :key="problem">{{ problem }}</li>
    </ul>
    <p v-if="publishError" class="text-xs text-destructive">{{ publishError }}</p>
    <p v-else-if="published" class="text-xs text-emerald-700 dark:text-emerald-300">
      Published {{ published.name }} as <span class="font-mono">{{ published.policy_id }}</span> with digest <span class="font-mono">{{ published.digest }}</span>.
    </p>
    <Button :disabled="publishing || problems.length > 0" @click="publish">
      <Send class="h-3.5 w-3.5" /> {{ publishing ? 'Publishing…' : 'Publish residency policy' }}
    </Button>
  </div>
</template>
