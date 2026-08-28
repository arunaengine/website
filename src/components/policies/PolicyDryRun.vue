<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { computed, ref } from 'vue'
import { FlaskConical, ShieldCheck, ShieldX } from '@lucide/vue'
import { usePolicies } from '@/composables/usePolicies'
import { errorMessage } from '@/lib/utils'
import {
  scopeLabel,
  traceLabel,
  type DryRunRequest,
  type DryRunResponse,
  type Policy,
} from '@/lib/policies'

const props = defineProps<{
  scope: 'realm' | 'group'
  groupId?: string
  /** The editor's current rows, so unsaved edits can be tested. */
  draft: Policy[]
  dirty: boolean
}>()

const { dryRun } = usePolicies()

type Target = 'saved' | 'effective' | 'draft'

const target = ref<Target>('saved')
const path = ref('')
const permission = ref('write')
const user = ref('')
const operation = ref('rest')
const bodyText = ref('')
const showAdvanced = ref(false)
const paramsText = ref('')
const headersText = ref('')

const running = ref(false)
const error = ref<string | null>(null)
const result = ref<DryRunResponse | null>(null)

const targetOptions = computed(() => [
  { value: 'saved', label: `Saved ${props.scope} policies` },
  ...(props.scope === 'group' ? [{ value: 'effective', label: 'Effective (realm + group)' }] : []),
  { value: 'draft', label: `Unsaved draft (${props.draft.length})` },
])

const permissionOptions = [
  { value: 'read', label: 'read' },
  { value: 'write', label: 'write' },
]

const canRun = computed(() => Boolean(path.value.trim()) && !running.value)

function parseJson(label: string, text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    throw new Error(`${label} is not valid JSON.`)
  }
}

function stringMap(label: string, text: string): Record<string, string> | undefined {
  const parsed = parseJson(label, text)
  if (parsed === undefined) return undefined
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`)
  }
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
  )
}

async function run() {
  running.value = true
  error.value = null
  result.value = null
  try {
    const request: DryRunRequest = {
      path: path.value.trim(),
      permission: permission.value,
      operation: operation.value.trim() || undefined,
      user: user.value.trim() || undefined,
      body: parseJson('Request body', bodyText.value),
      params: stringMap('Parameters', paramsText.value),
      headers: stringMap('Headers', headersText.value),
    }
    if (target.value === 'draft') {
      // Candidates are evaluated as given, so an unsaved edit can be tested
      // before it is stored. The backend still compiles and size-checks them.
      request.candidate_policies = props.draft
      if (props.scope === 'group' && props.groupId) request.group_id = props.groupId
    } else if (props.scope === 'group' && props.groupId) {
      request.group_id = props.groupId
      request.scope = target.value === 'effective' ? 'effective' : 'group'
    } else {
      request.scope = 'realm'
    }
    result.value = await dryRun(request)
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    running.value = false
  }
}
</script>

<template>
  <section class="surface-muted space-y-3 p-4">
    <div>
      <h4 class="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <FlaskConical class="h-4 w-4" /> Test console
      </h4>
      <p class="mt-1 text-sm text-muted-foreground">
        Evaluates a sample request without touching live traffic. Nothing is recorded and no real
        request is affected.
      </p>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <label class="block">
        <span class="mb-1 block text-xs font-medium text-muted-foreground">Evaluate against</span>
        <Select v-model="target" :options="targetOptions" aria-label="Policies to evaluate" />
        <span v-if="target === 'draft' && dirty" class="mt-1 block text-xs text-amber-700 dark:text-amber-300">
          Testing unsaved edits.
        </span>
      </label>
      <label class="block">
        <span class="mb-1 block text-xs font-medium text-muted-foreground">Permission</span>
        <Select v-model="permission" :options="permissionOptions" aria-label="Permission" />
      </label>
    </div>

    <label class="block">
      <span class="mb-1 block text-xs font-medium text-muted-foreground">Request path</span>
      <Input v-model="path" placeholder="/{realm}/g/{group}/objects/bucket/key" class="font-mono" />
    </label>

    <div class="grid gap-3 sm:grid-cols-2">
      <label class="block">
        <span class="mb-1 block text-xs font-medium text-muted-foreground">
          User <span class="font-normal">(empty = anonymous)</span>
        </span>
        <Input v-model="user" placeholder="01J…@realm" class="font-mono" />
      </label>
      <label class="block">
        <span class="mb-1 block text-xs font-medium text-muted-foreground">Operation</span>
        <Input v-model="operation" placeholder="rest" class="font-mono" />
      </label>
    </div>

    <label class="block">
      <span class="mb-1 block text-xs font-medium text-muted-foreground">
        Request body <span class="font-normal">(JSON, optional)</span>
      </span>
      <Textarea v-model="bodyText" rows="3" placeholder='{"visibility": "public"}' />
    </label>

    <button
      type="button"
      class="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      @click="showAdvanced = !showAdvanced"
    >
      {{ showAdvanced ? 'Hide' : 'Show' }} parameters and headers
    </button>

    <div v-if="showAdvanced" class="grid gap-3 sm:grid-cols-2">
      <label class="block">
        <span class="mb-1 block text-xs font-medium text-muted-foreground">Parameters (JSON object)</span>
        <Textarea v-model="paramsText" rows="2" placeholder='{"prefix": "raw/"}' />
      </label>
      <label class="block">
        <span class="mb-1 block text-xs font-medium text-muted-foreground">Headers (JSON object)</span>
        <Textarea v-model="headersText" rows="2" placeholder='{"content-type": "text/csv"}' />
      </label>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" :disabled="!canRun" @click="run">
        {{ running ? 'Running…' : 'Run test' }}
      </Button>
      <span v-if="error" class="text-xs text-destructive">{{ error }}</span>
    </div>

    <div v-if="result" class="space-y-2">
      <div
        class="surface flex flex-wrap items-center gap-2 px-3 py-2"
        :class="result.denied ? 'border-destructive/40 bg-destructive/5' : 'border-emerald-500/40 bg-emerald-500/5'"
      >
        <component
          :is="result.denied ? ShieldX : ShieldCheck"
          class="h-4 w-4"
          :class="result.denied ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'"
        />
        <span class="text-sm font-medium" :class="result.denied ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-300'">
          {{ result.denied ? 'Denied' : 'Allowed' }}
        </span>
        <span v-if="result.policy_name" class="text-sm text-muted-foreground">
          by <span class="font-mono">{{ result.policy_name }}</span>
          <template v-if="result.matched_scope"> in {{ scopeLabel(result.matched_scope) }}</template>
        </span>
        <span v-else-if="!result.denied" class="text-sm text-muted-foreground">
          No policy denied this request.
        </span>
      </div>

      <p v-if="result.reason" class="text-xs text-muted-foreground">{{ result.reason }}</p>

      <div v-if="result.trace.length" class="space-y-1">
        <p class="text-xs font-medium text-muted-foreground">
          Trace <span class="font-normal">(evaluation stops at the first denial)</span>
        </p>
        <ul class="space-y-1">
          <li
            v-for="(entry, index) in result.trace"
            :key="`${entry.policy_id}-${index}`"
            class="flex flex-wrap items-center gap-2 rounded-md bg-background/60 px-2.5 py-1.5 text-xs"
          >
            <Badge variant="outline" size="sm">{{ scopeLabel(entry.scope) }}</Badge>
            <span class="font-mono text-foreground">{{ entry.name }}</span>
            <Badge
              :variant="entry.result === 'Denied' ? 'destructive' : entry.result === 'Error' ? 'warn' : 'secondary'"
              size="sm"
            >
              {{ traceLabel(entry.result) }}
            </Badge>
            <span v-if="!entry.applicable" class="text-muted-foreground">guard did not match</span>
            <span v-if="entry.detail" class="text-muted-foreground">{{ entry.detail }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
