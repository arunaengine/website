<script setup lang="ts">
// A finished export another realm may read: stop that at the node that owns the export, named
// in the job details. Copies the other realm already made stay there.
import { inject, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import { useAruna } from '@/composables/useAruna'
import { JOB_CLIENT } from '@/composables/useJobs'
import { ApiError, apiErrorMessage, revokeGrant } from '@/lib/api'
import { checkOwnerNode, OwnerNodeError } from '@/lib/federation/transfer'
import { Ban } from '@lucide/vue'

const props = defineProps<{ jobId: string; ownerNodeUrl?: string }>()
const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
// The client that loaded this job; its node lists the nodes of this realm.
const jobClient = inject(JOB_CLIENT, null)

const step = ref<'idle' | 'confirm' | 'busy' | 'stopped' | 'unshared'>('idle')
const failure = ref<string | null>(null)

async function stop() {
  const epoch = sessionEpoch.value
  const client = jobClient?.() ?? { baseUrl: apiBaseUrl.value, token: authToken.value }
  failure.value = null
  if (!props.ownerNodeUrl) {
    step.value = 'idle'
    failure.value = 'This node does not say which node keeps the export.'
    return
  }
  step.value = 'busy'
  let owner: string | null = null
  try {
    // The bearer goes to the owner only once it is a configured node of this realm.
    owner = await checkOwnerNode(props.ownerNodeUrl, client.baseUrl ?? '', client.token ?? '')
    if (epoch !== sessionEpoch.value) return
    await revokeGrant(props.jobId, { baseUrl: owner, token: client.token })
    if (epoch === sessionEpoch.value) step.value = 'stopped'
  } catch (error) {
    if (epoch !== sessionEpoch.value) return
    // Only the owner's 404 means the export is not shared.
    const unshared = owner !== null && error instanceof ApiError && error.status === 404
    step.value = unshared ? 'unshared' : 'idle'
    if (unshared) return
    failure.value =
      error instanceof OwnerNodeError ? 'The export is kept on a node this realm does not list.' : apiErrorMessage(error)
  }
}
</script>

<template>
  <section class="space-y-2 border-t border-border pt-4">
    <p v-if="step === 'stopped'" class="text-xs text-foreground">
      Sharing stopped. Copies the other realm already made stay there.
    </p>
    <p v-else-if="step === 'unshared'" class="text-xs text-muted-foreground">
      This export is not shared with another realm.
    </p>
    <template v-else>
      <p class="text-xs text-muted-foreground">If another realm imports this export, you can stop it here.</p>
      <div class="flex items-center gap-2">
        <template v-if="step === 'confirm'">
          <Button variant="destructive" size="sm" @click="stop"><Ban class="h-3.5 w-3.5" /> Confirm stop sharing</Button>
          <Button variant="ghost" size="sm" @click="step = 'idle'">Keep sharing</Button>
        </template>
        <Button v-else variant="outline" size="sm" :disabled="step === 'busy'" @click="step = 'confirm'">
          <Ban class="h-3.5 w-3.5" /> Stop sharing
        </Button>
      </div>
    </template>
    <p v-if="failure" class="text-[11px] text-destructive">{{ failure }}</p>
  </section>
</template>
