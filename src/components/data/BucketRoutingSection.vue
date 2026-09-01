<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import Input from '@/components/ui/Input.vue'
import Switch from '@/components/ui/Switch.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Notice from '@/components/ui/Notice.vue'
import RoutingTargetPicker from '@/components/groups/RoutingTargetPicker.vue'
import { computed, ref, watch } from 'vue'
import { Plus, TriangleAlert, Trash2 } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { errorMessage } from '@/lib/utils'
import {
  ApiError,
  type GroupBackendResponse,
  type RoutingTarget,
  type StorageRoutingRule,
} from '@/lib/api'

const props = defineProps<{ open: boolean; bucket: string; groupId: string | null }>()

const { getBucketRouting, putBucketRouting, listGroupBackends, saving } = useAruna()
const { writesDisabled } = useConnectivity()

const rules = ref<StorageRoutingRule[]>([])
const backends = ref<GroupBackendResponse[]>([])
const warnings = ref<string[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const hidden = ref(false)

// The backend rejects two rules in one bucket sharing (exact, key_prefix).
const duplicate = computed(() => {
  const seen = new Set<string>()
  return rules.value.some((rule) => !seen.add(`${rule.exact}:${rule.key_prefix}`))
})
const incomplete = computed(() =>
  rules.value.some((rule) => !rule.target.backend_id && !rule.target.class),
)

let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = null
  saveError.value = null
  hidden.value = false
  try {
    const [routing, listed] = await Promise.all([
      getBucketRouting(props.bucket),
      props.groupId ? listGroupBackends(props.groupId).catch(() => null) : Promise.resolve(null),
    ])
    if (seq !== loadSeq) return
    rules.value = routing.rules
    warnings.value = routing.warnings
    backends.value = listed?.backends ?? []
  } catch (err) {
    if (seq !== loadSeq) return
    if (err instanceof ApiError && (err.status === 403 || err.status === 401)) hidden.value = true
    else loadError.value = errorMessage(err)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(
  () => [props.open, props.bucket],
  () => {
    if (props.open) void load()
  },
  { immediate: true },
)

function addRule() {
  rules.value = [...rules.value, { key_prefix: '', exact: false, target: {} }]
}

function removeRule(index: number) {
  rules.value = rules.value.filter((_, position) => position !== index)
}

function setTarget(index: number, target: RoutingTarget | null) {
  rules.value = rules.value.map((rule, position) =>
    position === index ? { ...rule, target: target ?? {} } : rule,
  )
}

function patchRule(index: number, patch: Partial<StorageRoutingRule>) {
  rules.value = rules.value.map((rule, position) =>
    position === index ? { ...rule, ...patch } : rule,
  )
}

async function save() {
  saveError.value = null
  try {
    const stored = await putBucketRouting(props.bucket, rules.value)
    rules.value = stored.rules
    warnings.value = stored.warnings
  } catch (err) {
    saveError.value = errorMessage(err)
  }
}
</script>

<template>
  <section class="space-y-3">
    <EmptyState
      v-if="hidden"
      compact
      title="Storage routing is only visible to admins of the group that owns this bucket."
    />
    <Skeleton v-else-if="loading && !rules.length" class="h-24" />
    <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
    <template v-else>
      <div class="max-h-[40vh] space-y-2 overflow-y-auto px-1 scrollbar-thin">
        <div
          v-for="(rule, index) in rules"
          :key="index"
          class="flex flex-wrap items-center gap-2 rounded-md border border-border px-2 py-2"
        >
          <Input
            :model-value="rule.key_prefix"
            class="h-8 min-w-[10rem] flex-1 font-mono text-xs"
            :placeholder="rule.exact ? 'reads/sample.fastq' : 'raw/ (empty matches everything)'"
            :aria-label="`Key ${rule.exact ? 'match' : 'prefix'} of rule ${index + 1}`"
            @update:model-value="(v: string | number) => patchRule(index, { key_prefix: String(v) })"
          />
          <label class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Switch
              :checked="rule.exact"
              :aria-label="`Match the exact key for rule ${index + 1}`"
              @update:checked="(v: boolean) => patchRule(index, { exact: v })"
            />
            exact key
          </label>
          <div class="min-w-[12rem] flex-1">
            <RoutingTargetPicker
              :model-value="rule.target.backend_id || rule.target.class ? rule.target : null"
              :backends="backends"
              :aria-label="`Target of rule ${index + 1}`"
              @update:model-value="(v: RoutingTarget | null) => setTarget(index, v)"
            />
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-destructive hover:text-destructive"
            :aria-label="`Remove rule ${index + 1}`"
            @click="removeRule(index)"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </Button>
        </div>
        <EmptyState
          v-if="!rules.length"
          compact
          title="No rules yet."
          description="New files follow the group default, and then this node's own routing."
        />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" @click="addRule">
          <Plus class="h-3.5 w-3.5" /> Add rule
        </Button>
        <Button
          size="sm"
          :disabled="saving || writesDisabled || duplicate || incomplete"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save routing' }}
        </Button>
      </div>

      <p v-if="duplicate" class="text-xs text-destructive">
        Two rules use the same key and match type; the node rejects that.
      </p>
      <p v-if="incomplete" class="text-xs text-destructive">Every rule needs a target.</p>
      <p v-if="saveError" class="text-xs text-destructive">{{ saveError }}</p>
      <Notice
        v-for="warning in warnings"
        :key="warning"
        tone="warning"
        class="flex items-start gap-2"
      >
        <TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{{ warning }}</span>
      </Notice>

      <p class="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
        <span>The most specific rule wins.</span>
        <DocsLink topic="where-data-lives" section="Storage backend" label="Learn how a rule is picked" />
      </p>
    </template>
  </section>
</template>
