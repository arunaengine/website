<script setup lang="ts">
// One guided panel for a linked folder. The three steps are optional and each one shows what it will do first.
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import FileRulesStep from '@/components/storage/FileRulesStep.vue'
import JobProgress from '@/components/storage/JobProgress.vue'
import MoveStep from '@/components/storage/MoveStep.vue'
import TidyStep from '@/components/storage/TidyStep.vue'
import Notice from '@/components/ui/Notice.vue'
import type { BackendImport, BackendImportRenames } from '@/lib/api'
import type { ProgressJob } from '@/lib/organize'
import { arunaPlace } from '@/lib/storageRules'

defineProps<{
  open: boolean
  groupId: string
  link: BackendImport | null
  renames: BackendImportRenames | null
  job: ProgressJob | null
  /** False when the node has no routes for moving files and removing copies. */
  supported: boolean
  controlling?: boolean
  /** Counts steps that ended, so the lists read again. */
  finished?: number
  error?: string | null
}>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'control', action: 'pause' | 'resume' | 'abort'): void
  (e: 'refresh'): void
  (e: 'unsupported'): void
}>()
</script>

<template>
  <Dialog :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Organize {{ link ? arunaPlace(link) : '' }}</DialogTitle>
        <DialogDescription>Nothing changes until you start a step. Each step shows what it will do first.</DialogDescription>
      </DialogHeader>

      <div v-if="link" class="max-h-[70vh] space-y-5 overflow-y-auto px-1 scrollbar-thin">
        <JobProgress v-if="job" :job="job" :busy="controlling" @control="(action) => emit('control', action)" />
        <Notice v-if="error" tone="error">{{ error }}</Notice>

        <section class="flex gap-3">
          <span class="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span>
          <div class="min-w-0 flex-1 space-y-2">
            <div>
              <h4 class="text-sm font-medium text-foreground">Where new files go</h4>
              <p class="text-xs text-muted-foreground">Rules for files Aruna finds for the first time.</p>
            </div>
            <FileRulesStep :group-id="groupId" :link="link" />
          </div>
        </section>

        <section v-if="supported" class="flex gap-3 border-t border-border pt-5">
          <span class="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">2</span>
          <div class="min-w-0 flex-1 space-y-2">
            <div>
              <h4 class="text-sm font-medium text-foreground">Move existing files</h4>
              <p class="text-xs text-muted-foreground">Give files that are already in the bucket a new name.</p>
            </div>
            <MoveStep
              :group-id="groupId"
              :link="link"
              :blocked="job !== null"
              @started="emit('refresh')"
              @unsupported="emit('unsupported')"
            />
          </div>
        </section>

        <section class="flex gap-3 border-t border-border pt-5">
          <span class="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{{ supported ? 3 : 2 }}</span>
          <div class="min-w-0 flex-1 space-y-2">
            <h4 class="text-sm font-medium text-foreground">Tidy your storage</h4>
            <TidyStep :group-id="groupId" :link="link" :renames="renames" :blocked="job !== null" :finished="finished" @started="emit('refresh')" />
          </div>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>
