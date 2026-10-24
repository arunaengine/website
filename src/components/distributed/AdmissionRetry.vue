<script setup lang="ts">
// A bucket stays pending until every coordinator and replica is admitted.
// A group admin asks the members that failed to admit again.
import { ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import { useAruna } from '@/composables/useAruna'
import { apiErrorMessage, type AdmissionResponse } from '@/lib/api'
import type { LiveState } from '@/lib/distribution'
import { RefreshCw } from '@lucide/vue'

const props = defineProps<{ live: LiveState }>()
const emit = defineEmits<{ (e: 'done'): void }>()

const { retryDistributedAdmission } = useAruna()
const busy = ref(false)
const outcome = ref<AdmissionResponse | null>(null)
const failure = ref<string | null>(null)

async function retry() {
  busy.value = true
  failure.value = null
  try {
    outcome.value = await retryDistributedAdmission(props.live.groupId, props.live.setId)
    emit('done')
  } catch (cause) {
    failure.value = apiErrorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <Notice tone="warning" title="The bucket is pending">
      It starts serving when every coordinator and replica is admitted. Members that were created are kept.
    </Notice>
    <Button variant="outline" size="sm" :disabled="busy" @click="retry">
      <RefreshCw class="size-3.5" :class="busy ? 'animate-spin' : ''" /> Retry admission
    </Button>
    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    <Notice v-else-if="outcome?.error" tone="warning">{{ outcome.error }}</Notice>
    <ul v-if="outcome" class="space-y-1 text-xs">
      <li v-for="member in outcome.members.filter((item) => !item.admitted)" :key="member.member_id" class="flex gap-2">
        <NodeLabel :node-id="member.node_id" class="font-medium" />
        <span class="text-muted-foreground">{{ member.error ?? 'Not admitted yet.' }}</span>
      </li>
    </ul>
  </div>
</template>
