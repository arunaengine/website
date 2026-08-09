<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { computed, ref, watch } from 'vue'
import { CheckCircle2, ChevronDown, ChevronRight, Trash2, XCircle } from '@lucide/vue'
import { usePolicies } from '@/composables/usePolicies'
import {
  MAX_POLICY_EXPRESSION_BYTES,
  POLICY_KINDS,
  expressionBytes,
  policyProblems,
  type Policy,
  type ValidatePolicyResponse,
} from '@/lib/policies'

const props = defineProps<{ policy: Policy; canAdmin: boolean; startOpen?: boolean }>()
const emit = defineEmits<{
  (e: 'update', policy: Policy): void
  (e: 'remove'): void
}>()

const { validatePolicy } = usePolicies()

const open = ref(props.startOpen ?? false)
const checking = ref(false)
const checkError = ref<string | null>(null)
const analysis = ref<ValidatePolicyResponse | null>(null)

const kindOptions = POLICY_KINDS.map((k) => ({ value: k.kind, label: k.label }))
const kindHint = computed(
  () => POLICY_KINDS.find((k) => k.kind === props.policy.kind)?.description ?? '',
)

const problems = computed(() => policyProblems(props.policy))
const problemFor = (field: 'name' | 'expression' | 'when') =>
  problems.value.find((p) => p.field === field)?.message

const bytes = computed(() => expressionBytes(props.policy.expression))
const nearCap = computed(() => bytes.value > MAX_POLICY_EXPRESSION_BYTES * 0.8)

// A stale verdict next to an edited expression reads as a fresh pass.
watch(
  () => [props.policy.expression, props.policy.when, props.policy.kind],
  () => {
    analysis.value = null
    checkError.value = null
  },
)

function patch(fields: Partial<Policy>) {
  emit('update', { ...props.policy, ...fields })
}

async function check() {
  checking.value = true
  checkError.value = null
  try {
    analysis.value = await validatePolicy({
      kind: props.policy.kind,
      when: props.policy.when?.trim() || null,
      expression: props.policy.expression,
    })
  } catch (err) {
    analysis.value = null
    checkError.value = err instanceof Error ? err.message : String(err)
  } finally {
    checking.value = false
  }
}

const summary = computed(() => props.policy.expression.trim() || 'No expression yet')
</script>

<template>
  <div class="surface-muted p-3">
    <div class="flex items-start gap-2">
      <Button
        variant="ghost"
        size="icon-sm"
        class="mt-0.5 shrink-0"
        :aria-expanded="open"
        :aria-label="open ? 'Collapse policy' : 'Expand policy'"
        @click="open = !open"
      >
        <ChevronDown v-if="open" class="h-4 w-4" />
        <ChevronRight v-else class="h-4 w-4" />
      </Button>

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="truncate text-sm font-medium text-foreground">
            {{ policy.name || 'Unnamed policy' }}
          </span>
          <Badge :variant="policy.kind === 'require' ? 'warn' : 'destructive'" class="text-[10px] uppercase">
            {{ policy.kind }}
          </Badge>
          <Badge v-if="!policy.enabled" variant="secondary" class="text-[10px] uppercase">off</Badge>
          <Badge v-if="problems.length" variant="warn" class="text-[10px] uppercase">incomplete</Badge>
        </div>
        <p v-if="!open" class="mt-1 truncate font-mono text-xs text-muted-foreground">{{ summary }}</p>
      </div>

      <Switch
        :checked="policy.enabled"
        :disabled="!canAdmin"
        :aria-label="`Enable ${policy.name || 'policy'}`"
        @update:checked="patch({ enabled: $event })"
      />
      <Button
        v-if="canAdmin"
        variant="ghost"
        size="icon-sm"
        class="text-destructive hover:text-destructive"
        :aria-label="`Remove ${policy.name || 'policy'}`"
        @click="emit('remove')"
      >
        <Trash2 class="h-4 w-4" />
      </Button>
    </div>

    <div v-if="open" class="mt-3 space-y-3 border-t border-border pt-3">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-muted-foreground">Name</span>
          <Input
            :model-value="policy.name"
            :disabled="!canAdmin"
            :invalid="problemFor('name') ? 'error' : undefined"
            placeholder="no-public-writes"
            @update:model-value="patch({ name: String($event) })"
          />
          <span v-if="problemFor('name')" class="mt-1 block text-xs text-destructive">
            {{ problemFor('name') }}
          </span>
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-muted-foreground">Kind</span>
          <Select
            :model-value="String(policy.kind)"
            :options="kindOptions"
            :disabled="!canAdmin"
            aria-label="Policy kind"
            @update:model-value="patch({ kind: $event })"
          />
          <span class="mt-1 block text-xs text-muted-foreground">{{ kindHint }}</span>
        </label>
      </div>

      <label class="block">
        <span class="mb-1 block text-xs font-medium text-muted-foreground">
          Guard <span class="font-normal">(optional; the policy only applies when this is true)</span>
        </span>
        <Textarea
          :model-value="policy.when ?? ''"
          :disabled="!canAdmin"
          :invalid="problemFor('when') ? 'error' : undefined"
          rows="2"
          placeholder='permission == "write"'
          @update:model-value="patch({ when: $event })"
        />
        <span v-if="problemFor('when')" class="mt-1 block text-xs text-destructive">
          {{ problemFor('when') }}
        </span>
      </label>

      <label class="block">
        <span class="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Expression</span>
          <span :class="nearCap ? 'text-amber-600 dark:text-amber-400' : ''">
            {{ bytes }} / {{ MAX_POLICY_EXPRESSION_BYTES }} bytes
          </span>
        </span>
        <Textarea
          :model-value="policy.expression"
          :disabled="!canAdmin"
          :invalid="problemFor('expression') ? 'error' : undefined"
          rows="3"
          placeholder='anonymous &amp;&amp; permission == "write"'
          @update:model-value="patch({ expression: $event })"
        />
        <span v-if="problemFor('expression')" class="mt-1 block text-xs text-destructive">
          {{ problemFor('expression') }}
        </span>
      </label>

      <div class="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" :disabled="checking || !policy.expression.trim()" @click="check">
          {{ checking ? 'Checking…' : 'Check syntax' }}
        </Button>
        <span v-if="checkError" class="text-xs text-destructive">{{ checkError }}</span>
        <span v-else-if="analysis?.valid" class="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 class="h-3.5 w-3.5" /> Compiles
        </span>
        <span v-else-if="analysis" class="flex items-center gap-1 text-xs text-destructive">
          <XCircle class="h-3.5 w-3.5" /> Does not compile
        </span>
      </div>

      <div v-if="analysis" class="space-y-1.5 text-xs">
        <p v-for="error in analysis.errors" :key="error" class="font-mono text-destructive">{{ error }}</p>
        <p v-if="analysis.unknown_variables.length" class="text-amber-700 dark:text-amber-300">
          Unknown variables: <span class="font-mono">{{ analysis.unknown_variables.join(', ') }}</span>
          — these are always absent, so the policy fails closed at request time.
        </p>
        <p v-if="analysis.unknown_functions.length" class="text-amber-700 dark:text-amber-300">
          Unknown functions: <span class="font-mono">{{ analysis.unknown_functions.join(', ') }}</span>
        </p>
        <p v-if="analysis.valid && analysis.referenced_variables.length" class="text-muted-foreground">
          Reads: <span class="font-mono">{{ analysis.referenced_variables.join(', ') }}</span>
        </p>
      </div>
    </div>
  </div>
</template>
