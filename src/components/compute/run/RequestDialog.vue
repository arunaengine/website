<script setup lang="ts">
// The request the Run button sends, verbatim: the endpoint it goes to and the
// JSON body.
import Badge from '@/components/ui/Badge.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import TaskJsonPreview from '@/components/compute/TaskJsonPreview.vue'
import { injectCustomRun } from '@/composables/useCustomRun'

defineProps<{ open: boolean; endpoint: string; sentTo: string }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const { task } = injectCustomRun()
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent
      class="flex h-[92dvh] max-h-[92dvh] max-w-[960px] flex-col gap-0 overflow-hidden p-0"
      aria-describedby="request-endpoint"
    >
      <div class="shrink-0 border-b border-border px-6 py-4">
        <DialogTitle class="font-display text-base font-semibold text-aruna-navy">Request</DialogTitle>
        <p id="request-endpoint" class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" size="sm" class="font-mono">{{ endpoint }}</Badge>
          <span>{{ sentTo }}</span>
        </p>
      </div>
      <div data-tutorial="run-review" class="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-6">
        <div class="rounded-lg border border-border p-4">
          <TaskJsonPreview title="Run request" :task="task" />
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
