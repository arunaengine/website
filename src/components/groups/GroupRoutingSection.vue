<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import RoutingTargetPicker from '@/components/groups/RoutingTargetPicker.vue'
import { computed, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { targetLabel } from '@/lib/storage'
import { ApiError, type GroupBackendResponse, type RoutingTarget } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import Notice from '@/components/ui/Notice.vue'

const props = defineProps<{ groupId: string; backends: GroupBackendResponse[]; canAdmin: boolean }>()

const { getGroupRouting, putGroupRouting, saving } = useAruna()
const { writesDisabled } = useConnectivity()

const stored = ref<RoutingTarget | null>(null)
const draft = ref<RoutingTarget | null>(null)
const warnings = ref<string[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const hidden = ref(false)

const dirty = computed(() => JSON.stringify(draft.value ?? null) !== JSON.stringify(stored.value ?? null))

let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = null
  hidden.value = false
  try {
    const response = await getGroupRouting(props.groupId)
    if (seq !== loadSeq) return
    stored.value = response.default_target ?? null
    draft.value = response.default_target ?? null
    warnings.value = response.warnings
  } catch (err) {
    if (seq !== loadSeq) return
    if (err instanceof ApiError && (err.status === 403 || err.status === 401)) hidden.value = true
    else loadError.value = errorMessage(err)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(() => props.groupId, () => void load(), { immediate: true })

async function save() {
  saveError.value = null
  try {
    const response = await putGroupRouting(props.groupId, draft.value)
    stored.value = response.default_target ?? null
    draft.value = response.default_target ?? null
    warnings.value = response.warnings
  } catch (err) {
    saveError.value = errorMessage(err)
  }
}
</script>

<template>
  <div class="space-y-2">
    <p class="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
      <span>Where new uploads go when no bucket rule says otherwise.</span>
      <DocsLink topic="where-data-lives" section="Storage backend" label="Learn about storage backends" />
    </p>
    <div v-if="hidden" class="text-xs text-muted-foreground">
      The default storage backend is only visible to group admins.
    </div>
    <Skeleton v-else-if="loading && !draft && !stored" class="h-9" />
    <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
    <template v-else>
      <div v-if="canAdmin" class="flex flex-wrap items-center gap-2">
        <div class="min-w-[14rem] flex-1">
          <RoutingTargetPicker
            :model-value="draft"
            :backends="props.backends"
            allow-default
            aria-label="Where new uploads go"
            @update:model-value="(v: RoutingTarget | null) => (draft = v)"
          />
        </div>
        <Button
          size="sm"
          :disabled="!dirty || saving || writesDisabled"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </Button>
        <Button v-if="dirty" variant="ghost" size="sm" :disabled="saving" @click="draft = stored">Reset</Button>
      </div>
      <p v-else class="text-xs text-foreground">New uploads go to: {{ targetLabel(stored, props.backends) }}</p>
      <p v-if="writesDisabled" class="text-xs text-muted-foreground">{{ OFFLINE_WRITE_HINT }}</p>
      <p v-if="saveError" class="text-xs text-destructive">{{ saveError }}</p>
      <Notice v-if="warnings.length" tone="warning" :lines="warnings" />
    </template>
  </div>
</template>
