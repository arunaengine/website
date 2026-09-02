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
import type {
  CreatePolicyRequest,
  LabelMatchBody,
  PolicyResponse,
  SelectorBody,
} from '@/lib/placementPolicies'
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

// A card allows one named node, or every node whose fields all match.
type Mode = 'node' | 'matching'
interface Card {
  mode: Mode
  selector: SelectorBody
}
const MODES: { value: Mode; label: string }[] = [
  { value: 'node', label: 'One node' },
  { value: 'matching', label: 'Nodes matching' },
]
// Radix rejects an empty option value, so "any" has a sentinel.
const ANY = '*'
// The node id label duplicates the "One node" mode, so it is not a filter.
const NODE_LABEL_KEY = 'aruna-engine.org/node'

const nodes = computed(() => realmInfo.value?.nodes ?? [])
const nodeOptions = computed(() =>
  realmNodes.nodes.value.map((node) => ({ value: node.nodeId, label: node.label })),
)
const locations = computed(() => knownLocations(nodes.value))
const executors = computed(() => advertisedExecutors(nodes.value))
const labelPairs = computed(() =>
  publishedLabels(nodes.value).filter((pair) => pair.key !== NODE_LABEL_KEY),
)
const labelKeys = computed(() => [...new Set(labelPairs.value.map((pair) => pair.key))])

function withAny(values: string[]) {
  return [{ value: ANY, label: 'Any' }, ...asOptions(values)]
}
function asOptions(values: string[]) {
  return values.map((value) => ({ value, label: value }))
}
function valuesFor(key: string): string[] {
  return labelPairs.value.filter((pair) => pair.key === key).map((pair) => pair.value)
}

const name = ref('')
const cards = ref<Card[]>([newCard()])
const publishing = ref(false)
const publishError = ref<string | null>(null)

const selectors = computed(() => cards.value.map((card) => card.selector))
const request = computed<CreatePolicyRequest>(() => ({
  name: name.value,
  allowed: selectors.value,
  owner_group_id: props.ownerGroupId,
}))
const problems = computed(() => policyCreationProblems(request.value))
const matched = computed(() => matchingNodes(selectors.value, nodes.value).length)

function newCard(): Card {
  return { mode: 'node', selector: emptySelector() }
}

function cardMatches(card: Card): number {
  return matchingNodes([card.selector], nodes.value).length
}

function patch(index: number, change: (card: Card) => Card) {
  cards.value = cards.value.map((card, position) => (position === index ? change(card) : card))
}

function addCard() {
  cards.value = [...cards.value, newCard()]
}

function removeCard(index: number) {
  cards.value = cards.value.filter((_, position) => position !== index)
}

// A mode switch starts the card over, so a node id never travels with fields
// that belong to the other mode.
function setMode(index: number, mode: Mode) {
  if (cards.value[index]?.mode === mode) return
  patch(index, () => ({ mode, selector: emptySelector() }))
}

function setNode(index: number, nodeId: string) {
  patch(index, (card) => ({ ...card, selector: { labels: [], node_id: nodeId } }))
}

function setField(index: number, field: 'location' | 'executor_kind', value: string) {
  patch(index, (card) => {
    const selector = { ...card.selector }
    if (value === ANY) delete selector[field]
    else selector[field] = value
    return { ...card, selector }
  })
}

function setLabels(index: number, labels: LabelMatchBody[]) {
  patch(index, (card) => ({ ...card, selector: { ...card.selector, labels } }))
}

function labelsOf(index: number): LabelMatchBody[] {
  return cards.value[index]?.selector.labels ?? []
}

function addLabel(index: number) {
  const first = labelPairs.value[0]
  if (first) setLabels(index, [...labelsOf(index), { key: first.key, value: first.value }])
}

function setLabelKey(index: number, labelIndex: number, key: string) {
  setLabels(
    index,
    labelsOf(index).map((label, position) =>
      position === labelIndex ? { key, value: valuesFor(key)[0] ?? '' } : label,
    ),
  )
}

function setLabelValue(index: number, labelIndex: number, value: string) {
  setLabels(
    index,
    labelsOf(index).map((label, position) => (position === labelIndex ? { ...label, value } : label)),
  )
}

function removeLabel(index: number, labelIndex: number) {
  setLabels(index, labelsOf(index).filter((_, position) => position !== labelIndex))
}

async function publish() {
  if (publishing.value || problems.value.length) return
  publishing.value = true
  publishError.value = null
  try {
    const policy = await createPlacementPolicy(normalizeCreatePolicyRequest(request.value))
    name.value = ''
    cards.value = [newCard()]
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
        <label for="policy-name" class="text-xs font-medium text-foreground">
          Name <span class="text-destructive" aria-hidden="true">*</span>
          <span class="sr-only">(required)</span>
        </label>
        <Input
          id="policy-name"
          v-model="name"
          class="mt-1"
          placeholder="Copies inside the EU"
          required
          aria-required="true"
        />
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
            Nodes that fit any card below; anything not listed is excluded.
          </p>
        </div>
        <Button size="sm" variant="outline" @click="addCard">
          <Plus class="size-3.5" /> Add card
        </Button>
      </div>

      <article
        v-for="(card, index) in cards"
        :key="index"
        class="space-y-3 rounded-lg border border-border bg-background p-4"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-semibold text-foreground">{{ index ? 'or allow' : 'Allow' }}</span>
          <div
            v-if="nodes.length"
            class="inline-flex rounded-md border border-border p-0.5"
            role="group"
            :aria-label="`What card ${index + 1} allows`"
          >
            <Button
              v-for="mode in MODES"
              :key="mode.value"
              size="sm"
              class="h-6 px-2 text-[11px]"
              :variant="card.mode === mode.value ? 'secondary' : 'ghost'"
              :aria-pressed="card.mode === mode.value"
              @click="setMode(index, mode.value)"
            >
              {{ mode.label }}
            </Button>
          </div>
          <Button
            v-if="cards.length > 1"
            variant="ghost"
            size="icon-sm"
            class="ml-auto text-destructive hover:text-destructive"
            :aria-label="`Remove card ${index + 1}`"
            @click="removeCard(index)"
          >
            <Trash2 class="size-3.5" />
          </Button>
        </div>

        <p v-if="!nodes.length" class="text-xs text-muted-foreground">
          No node has joined this realm yet, so there is nothing to pick.
        </p>

        <Select
          v-else-if="card.mode === 'node'"
          :model-value="card.selector.node_id ?? ''"
          :options="nodeOptions"
          label="Node"
          placeholder="Pick a node"
          :aria-label="`Node of card ${index + 1}`"
          @update:model-value="(value: string) => setNode(index, value)"
        />

        <template v-else>
          <div class="grid gap-2 sm:grid-cols-2">
            <Select
              v-if="locations.length"
              :model-value="card.selector.location ?? ANY"
              :options="withAny(locations)"
              label="Location"
              :aria-label="`Location of card ${index + 1}`"
              @update:model-value="(value: string) => setField(index, 'location', value)"
            />
            <p v-else class="flex h-9 items-center text-xs text-muted-foreground">
              No node publishes a location yet.
            </p>
            <Select
              v-if="executors.length"
              :model-value="card.selector.executor_kind ?? ANY"
              :options="withAny(executors)"
              label="Executor"
              :aria-label="`Executor of card ${index + 1}`"
              @update:model-value="(value: string) => setField(index, 'executor_kind', value)"
            />
            <p v-else class="flex h-9 items-center text-xs text-muted-foreground">
              No node advertises an executor yet.
            </p>
          </div>

          <div class="space-y-2">
            <div
              v-for="(label, labelIndex) in card.selector.labels"
              :key="labelIndex"
              class="flex items-center gap-2"
            >
              <Select
                :model-value="label.key"
                :options="asOptions(labelKeys)"
                label="Label"
                :aria-label="`Label key ${labelIndex + 1} of card ${index + 1}`"
                @update:model-value="(value: string) => setLabelKey(index, labelIndex, value)"
              />
              <span class="text-muted-foreground">=</span>
              <Select
                :model-value="label.value"
                :options="asOptions(valuesFor(label.key))"
                :aria-label="`Label value ${labelIndex + 1} of card ${index + 1}`"
                @update:model-value="(value: string) => setLabelValue(index, labelIndex, value)"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                class="shrink-0 text-destructive hover:text-destructive"
                :aria-label="`Remove label ${labelIndex + 1} from card ${index + 1}`"
                @click="removeLabel(index, labelIndex)"
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>
            <Button
              v-if="labelPairs.length"
              size="sm"
              variant="ghost"
              class="h-6 px-2 text-[11px]"
              @click="addLabel(index)"
            >
              <Plus class="size-3.5" /> Add label
            </Button>
            <p v-else class="text-xs text-muted-foreground">No node publishes a label yet.</p>
          </div>
        </template>

        <p v-if="nodes.length" class="text-[11px] text-muted-foreground">
          Matches {{ cardMatches(card) }} of {{ nodes.length }} nodes.
        </p>
      </article>

      <p v-if="nodes.length" class="text-[11px] font-medium text-foreground">
        This policy admits {{ matched }} of {{ nodes.length }} nodes right now.
      </p>
    </section>

    <ul v-if="problems.length" class="list-disc space-y-1 pl-5 text-xs text-destructive">
      <li v-for="problem in problems" :key="problem">{{ problem }}</li>
    </ul>
    <RefusalNote v-if="publishError" :message="publishError" />

    <div class="space-y-2">
      <Notice tone="info">
        Publishing creates a new policy id. Buckets keep the one they carry until you attach the
        new one.
        <DocsLink icon topic="where-data-lives" section="Placement policies" class="ml-0.5" />
      </Notice>
      <Button :disabled="publishing || problems.length > 0" @click="publish">
        <Send class="size-3.5" /> {{ publishing ? 'Publishing…' : 'Publish policy' }}
      </Button>
    </div>
  </div>
</template>
