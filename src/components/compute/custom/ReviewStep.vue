<script setup lang="ts">
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import RunPlacementSection from '@/components/compute/RunPlacementSection.vue'
import TaskJsonPreview from '@/components/compute/TaskJsonPreview.vue'
import { injectCustomRun } from '@/composables/useCustomRun'
import { ArrowRight } from '@lucide/vue'

defineProps<{
  submitError: string | null
  submitRetryable: boolean
  submittedWithoutWorkspace: string | null
}>()

const router = useRouter()
const {
  runTarget,
  realmName,
  placementLabels,
  targetProblems,
  useNative,
  nativeDropped,
  hasFolderCapture,
  task,
} = injectCustomRun()
</script>

<template>
  <div class="space-y-3">
    <RunPlacementSection
      v-model:target="runTarget.target.value"
      v-model:labels="placementLabels"
      :available="runTarget.available.value"
      :local="runTarget.local.value"
      :compute="runTarget.compute.value"
      :realm-name="realmName"
      :problems="targetProblems"
    />
    <div
      v-if="useNative"
      class="space-y-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground"
    >
      <p>
        This run goes through Aruna's native jobs API, because the standard run interface
        cannot express the advanced placement options you set.
      </p>
      <p v-if="nativeDropped.length" class="text-[11px] text-muted-foreground">
        The native surface carries no {{ nativeDropped.join(', no ') }}, so that is not sent.
      </p>
    </div>
    <p
      v-if="hasFolderCapture"
      class="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground"
    >
      A folder capture travels as a wildcard pattern. Only the files written directly in the
      captured folder are uploaded; nested subfolders are not.
    </p>
    <TaskJsonPreview title="Run request" :task="task" />
    <details class="text-[11px] text-muted-foreground">
      <summary class="cursor-pointer">Technical details</summary>
      <code class="mt-1 block rounded bg-muted px-2 py-1">{{ useNative ? 'POST /jobs/' : 'POST /ga4gh/tes/v1/tasks' }}</code>
    </details>
    <Notice v-if="submitError" tone="error">
      {{ submitError }}
      <span v-if="submitRetryable" class="mt-1 block">
        Running it again reuses the same idempotency key, so a request that already committed
        is replayed rather than duplicated.
      </span>
    </Notice>
    <Notice v-if="submittedWithoutWorkspace" tone="warning" class="flex flex-wrap items-center gap-2">
      <span>The run started, but this node does not support workspace choices yet, so it runs without one.</span>
      <Button
        variant="outline"
        size="sm"
        class="shrink-0"
        @click="router.push({ name: 'task', params: { taskId: submittedWithoutWorkspace } })"
      >
        View run <ArrowRight class="h-3.5 w-3.5" />
      </Button>
    </Notice>
  </div>
</template>
