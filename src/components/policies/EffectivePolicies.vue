<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { computed, ref, watch } from 'vue'
import { RefreshCw, ShieldCheck } from '@lucide/vue'
import { ApiError } from '@/lib/api'
import { isPoliciesUnsupported, usePolicies } from '@/composables/usePolicies'
import { scopeLabel, type ScopedPolicy } from '@/lib/policies'

// Read-only merge of realm and group policies, in the order they are evaluated.
const props = defineProps<{ groupId?: string }>()

const { getEffective } = usePolicies()

const policies = ref<ScopedPolicy[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const hidden = ref(false)
const unsupported = ref(false)

const enabledCount = computed(() => policies.value.filter((policy) => policy.enabled).length)

let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loading.value = true
  error.value = null
  hidden.value = false
  unsupported.value = false
  try {
    const response = await getEffective(props.groupId)
    if (seq !== loadSeq) return
    policies.value = response.policies
  } catch (err) {
    if (seq !== loadSeq) return
    if (isPoliciesUnsupported(err)) unsupported.value = true
    else if (err instanceof ApiError && (err.status === 401 || err.status === 403)) hidden.value = true
    else error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(() => props.groupId, () => void load(), { immediate: true })

defineExpose({ reload: load })
</script>

<template>
  <section v-if="!hidden && !unsupported" class="space-y-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-sm font-semibold text-foreground">Effective policies</h3>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every rule that applies here, realm-wide rules first. Requests are checked against these
          in order and stop at the first denial.
        </p>
      </div>
      <Button variant="ghost" size="sm" :disabled="loading" @click="load">
        <RefreshCw class="h-3.5 w-3.5" :class="loading ? 'animate-spin' : ''" /> Reload
      </Button>
    </div>

    <div v-if="loading && !policies.length" class="space-y-2">
      <Skeleton v-for="n in 2" :key="n" class="h-12 w-full" />
    </div>

    <ErrorPanel v-else-if="error" :message="error" @retry="load" />

    <EmptyState
      v-else-if="!policies.length"
      title="No policies apply here"
      description="Authorized requests are not narrowed any further."
    >
      <template #icon><ShieldCheck class="h-5 w-5" /></template>
    </EmptyState>

    <template v-else>
      <p class="text-xs text-muted-foreground">
        {{ enabledCount }} active
        <template v-if="enabledCount !== policies.length">
          ({{ policies.length - enabledCount }} disabled)
        </template>
      </p>
      <ul class="space-y-2">
        <li v-for="(policy, index) in policies" :key="`${policy.policy_id}-${index}`" class="surface-muted p-3">
          <div class="flex flex-wrap items-center gap-2">
            <Badge variant="outline" class="text-[10px]">{{ scopeLabel(policy.scope) }}</Badge>
            <span class="text-sm font-medium text-foreground">{{ policy.name }}</span>
            <Badge :variant="policy.kind === 'require' ? 'warn' : 'destructive'" class="text-[10px] uppercase">
              {{ policy.kind }}
            </Badge>
            <Badge v-if="!policy.enabled" variant="secondary" class="text-[10px] uppercase">off</Badge>
          </div>
          <p v-if="policy.when" class="mt-1.5 font-mono text-xs text-muted-foreground">
            when {{ policy.when }}
          </p>
          <p class="mt-1 break-words font-mono text-xs text-foreground/80">{{ policy.expression }}</p>
        </li>
      </ul>
    </template>
  </section>
</template>
