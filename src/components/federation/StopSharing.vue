<script setup lang="ts">
// A finished export another realm may read: stop that at the node that holds the export.
// Copies the other realm already made stay there.
import { inject, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import { useAruna } from '@/composables/useAruna'
import { JOB_CLIENT } from '@/composables/useJobs'
import { ApiError, apiErrorMessage, revokeGrant } from '@/lib/api'
import { Ban } from '@lucide/vue'

const props = defineProps<{ jobId: string }>()
const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
// The client that loaded this job, so the request goes to the node that holds the export.
const jobClient = inject(JOB_CLIENT, null)

const step = ref<'idle' | 'confirm' | 'busy' | 'stopped' | 'unshared'>('idle')
const failure = ref<string | null>(null)

async function stop() {
  const epoch = sessionEpoch.value
  const client = jobClient?.() ?? { baseUrl: apiBaseUrl.value, token: authToken.value }
  step.value = 'busy'
  failure.value = null
  try {
    await revokeGrant(props.jobId, client)
    if (epoch === sessionEpoch.value) step.value = 'stopped'
  } catch (error) {
    if (epoch !== sessionEpoch.value) return
    step.value = error instanceof ApiError && error.status === 404 ? 'unshared' : 'idle'
    if (step.value === 'idle') failure.value = apiErrorMessage(error)
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
