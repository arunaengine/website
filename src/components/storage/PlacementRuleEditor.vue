<script setup lang="ts">
// Publishes one placement policy. The wire model is an allow-list, so the
// editor offers allowing and nothing else: no forbidding, no preference, no
// number of copies. Every condition is picked from what the realm publishes.
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Select from '@/components/ui/Select.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { knownLocations } from '@/lib/placement'
import {
  emptySelector,
  normalizeCreatePolicyRequest,
  placementPoliciesErrorMessage,
  policyCreationProblems,
} from '@/lib/placementPolicies'
import type { CreatePolicyRequest, PolicyResponse, SelectorBody } from '@/lib/placementPolicies'
import { advertisedExecutors, matchingNodes, publishedLabels } from '@/lib/placementRules'
import { Plus, Send, Trash2 } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    /** null publishes a realm-wide policy; a group id publishes for that group. */
    ownerGroupId?: string | null
    ownerLabel?: string
  }>(),
  { ownerGroupId: null, ownerLabel: 'Realm' },
)
const emit = defineEmits<{ (event: 'published', policy: PolicyResponse): void }>()

const { realmInfo } = useAruna()
const realmNodes = useRealmNodes()
const { createPlacementPolicy } = usePlacementPolicies()

const nodes = computed(() => realmInfo.value?.nodes ?? [])
const nodeOptions = computed(() => [
  { value: '', label: 'Any node' },
  ...realmNodes.nodes.value.map((node) => ({ value: node.nodeId, label: node.label })),
])
const locations = computed(() => knownLocations(nodes.value))
const executors = computed(() => advertisedExecutors(nodes.value))
const labelPairs = computed(() => publishedLabels(nodes.value))

const name = ref('')
const selectors = ref<SelectorBody[]>([emptySelector()])
const publishing = ref(false)
const publishError = ref<string | null>(null)

const request = computed<CreatePolicyRequest>(() => ({
  name: name.value,
  allowed: selectors.value,
  owner_group_id: props.ownerGroupId,
}))
const problems = computed(() => policyCreationProblems(request.value))
const matched = computed(() => matchingNodes(selectors.value, nodes.value).length)

function selectorMatches(selector: SelectorBody): number {
  return matchingNodes([selector], nodes.value).length
}

function addSelector() {
  selectors.value = [...selectors.value, emptySelector()]
}

function removeSelector(index: number) {
  selectors.value = selectors.value.filter((_, position) => position !== index)
}

function setField(index: number, field: 'node_id' | 'location' | 'executor_kind', value: string) {
  const next = value.trim()
  selectors.value = selectors.value.map((selector, position) =>
    position === index ? { ...selector, [field]: next || undefined } : selector,
  )
}

function toggleField(index: number, field: 'location' | 'executor_kind', value: string) {
  setField(index, field, selectors.value[index]?.[field] === value ? '' : value)
}

function addLabel(index: number, key = '', value = '') {
  selectors.value[index]?.labels.push({ key, value })
}

function removeLabel(index: number, labelIndex: number) {
  selectors.value[index]?.labels.splice(labelIndex, 1)
}

async function publish() {
  if (publishing.value || problems.value.length) return
  publishing.value = true
  publishError.value = null
  try {
    const policy = await createPlacementPolicy(normalizeCreatePolicyRequest(request.value))
    name.value = ''
    selectors.value = [emptySelector()]
    emit('published', policy)
  } catch (error) {
    publishError.value = placementPoliciesErrorMessage(error, 'create')
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label for="policy-name" class="text-xs font-medium text-foreground">Name</label>
        <Input id="policy-name" v-model="name" class="mt-1" placeholder="Copies inside the EU" />
      </div>
      <div>
        <span class="text-xs font-medium text-foreground">Owner</span>
        <p class="mt-1 flex h-9 items-center">
          <Badge variant="outline">{{ props.ownerLabel }}</Badge>
        </p>
      </div>
    </div>

    <section class="space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 class="text-sm font-semibold text-foreground">Copies may be stored on</h4>
          <p class="mt-1 text-[11px] text-muted-foreground">
            A card admits a node only when every condition in it fits; a node that fits any card is
            admitted. Anything not listed is excluded.
          </p>
        </div>
        <Button size="sm" variant="outline" @click="addSelector">
          <Plus class="size-3.5" /> Add card
        </Button>
      </div>

      <article
        v-for="(selector, index) in selectors"
        :key="index"
        class="space-y-3 rounded-lg border border-border bg-background p-4"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-foreground">Card {{ index + 1 }}</span>
            <Badge v-if="index" variant="outline" size="sm">or</Badge>
          </div>
          <Button
            v-if="selectors.length > 1"
            variant="ghost"
            size="icon-sm"
            class="text-destructive hover:text-destructive"
            :aria-label="`Remove card ${index + 1}`"
            @click="removeSelector(index)"
          >
            <Trash2 class="size-3.5" />
          </Button>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="text-[11px] font-medium text-foreground">Node</label>
            <Select
              :model-value="selector.node_id ?? ''"
              :options="nodeOptions"
              class="mt-1"
              :aria-label="`Node of card ${index + 1}`"
              @update:model-value="(value: string) => setField(index, 'node_id', value)"
            />
          </div>
          <div>
            <label :for="`card-${index}-executor`" class="text-[11px] font-medium text-foreground">
              Executor kind
            </label>
            <Input
              :id="`card-${index}-executor`"
              :model-value="selector.executor_kind ?? ''"
              class="mt-1 font-mono text-xs"
              placeholder="Any executor"
              @update:model-value="(value: string | number) => setField(index, 'executor_kind', String(value))"
            />
            <div v-if="executors.length" class="mt-1.5 flex flex-wrap gap-1">
              <Button
                v-for="kind in executors"
                :key="kind"
                size="sm"
                class="h-6 px-2 text-[11px]"
                :variant="selector.executor_kind === kind ? 'default' : 'outline'"
                :aria-pressed="selector.executor_kind === kind"
                @click="toggleField(index, 'executor_kind', kind)"
              >
                {{ kind }}
              </Button>
            </div>
          </div>
        </div>

        <div>
          <span class="text-[11px] font-medium text-foreground">Location</span>
          <div v-if="locations.length" class="mt-1.5 flex flex-wrap gap-1">
            <Button
              v-for="location in locations"
              :key="location"
              size="sm"
              class="h-6 px-2 text-[11px]"
              :variant="selector.location === location ? 'default' : 'outline'"
              :aria-pressed="selector.location === location"
              @click="toggleField(index, 'location', location)"
            >
              {{ location }}
            </Button>
          </div>
          <p v-else class="mt-1 text-[11px] text-muted-foreground">
            No node in this realm publishes a location yet.
          </p>
          <Input
            :model-value="selector.location ?? ''"
            class="mt-1.5 font-mono text-xs"
            placeholder="Any location"
            :aria-label="`Location of card ${index + 1}`"
            @update:model-value="(value: string | number) => setField(index, 'location', String(value))"
          />
        </div>

        <div>
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-medium text-foreground">Node labels</span>
            <Button size="sm" variant="ghost" class="h-6 px-2 text-[11px]" @click="addLabel(index)">
              <Plus class="size-3.5" /> Add label
            </Button>
          </div>
          <div v-if="selector.labels.length" class="mt-1.5 space-y-1.5">
            <div v-for="(label, labelIndex) in selector.labels" :key="labelIndex" class="flex items-center gap-2">
              <Input
                v-model="label.key"
                class="font-mono text-xs"
                placeholder="key"
                :aria-label="`Label key ${labelIndex + 1} of card ${index + 1}`"
              />
              <span class="text-muted-foreground">=</span>
              <Input
                v-model="label.value"
                class="font-mono text-xs"
                placeholder="value"
                :aria-label="`Label value ${labelIndex + 1} of card ${index + 1}`"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-destructive hover:text-destructive"
                :aria-label="`Remove label ${labelIndex + 1} from card ${index + 1}`"
                @click="removeLabel(index, labelIndex)"
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          </div>
          <div v-if="labelPairs.length" class="mt-1.5 flex flex-wrap gap-1">
            <Button
              v-for="pair in labelPairs"
              :key="`${pair.key}=${pair.value}`"
              size="sm"
              variant="outline"
              class="h-6 px-2 font-mono text-[11px]"
              @click="addLabel(index, pair.key, pair.value)"
            >
              {{ pair.key }}={{ pair.value }}
            </Button>
          </div>
        </div>

        <p class="text-[11px] text-muted-foreground">
          Matches {{ selectorMatches(selector) }} of {{ nodes.length }} realm nodes right now.
        </p>
      </article>

      <p class="text-[11px] font-medium text-foreground">
        This policy admits {{ matched }} of {{ nodes.length }} realm nodes right now.
      </p>
    </section>

    <ul v-if="problems.length" class="list-disc space-y-1 pl-5 text-xs text-destructive">
      <li v-for="problem in problems" :key="problem">{{ problem }}</li>
    </ul>
    <RefusalNote v-if="publishError" :message="publishError" />

    <div class="space-y-2">
      <Notice tone="info">
        Publishing creates a new policy id. Buckets keep the policy they carry until they are
        attached to the new one.
      </Notice>
      <div class="flex flex-wrap items-center gap-3">
        <Button :disabled="publishing || problems.length > 0" @click="publish">
          <Send class="size-3.5" /> {{ publishing ? 'Publishing…' : 'Publish policy' }}
        </Button>
        <DocsLink topic="where-data-lives" section="Placement policies" label="Learn about placement policies" />
      </div>
      <p v-if="problems.length" class="text-[11px] text-muted-foreground">
        Publishing stays disabled while the list above is not resolved.
      </p>
    </div>
  </div>
</template>
