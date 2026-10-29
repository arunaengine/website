<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Notice from '@/components/ui/Notice.vue'
import type { DataManager } from '@/composables/useDataManager'
import { formatBytes } from '@/lib/utils'

const props = defineProps<{ manager: DataManager }>()

// Uploads start from Add data or a drop on the file table; this holds their notices.
const { uploadRestrictionError, precheck, confirmPrecheckUpload } = props.manager
</script>

<template>
  <p v-if="uploadRestrictionError" class="mt-2 text-xs text-destructive">{{ uploadRestrictionError }}</p>

  <Dialog :open="precheck !== null" @update:open="(v: boolean) => { if (!v) precheck = null }">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>Storage quota warning</DialogTitle>
        <DialogDescription>
          This upload would push the group past its storage quota. The check is advisory, you can still upload.
        </DialogDescription>
      </DialogHeader>
      <div v-if="precheck" class="space-y-2 text-xs">
        <Notice v-if="precheck.projected.state === 'over-ceiling'" tone="error">
          This upload adds <strong>{{ formatBytes(precheck.totalBytes) }}</strong> to a group already using
          <strong>{{ formatBytes(precheck.current.usedBytes) }}</strong>. It would exceed the group's hard cap of
          <strong>{{ formatBytes(precheck.projected.ceilingBytes ?? 0) }}</strong>, the node rejects writes above the cap with <code>QuotaExceeded</code>.
        </Notice>
        <Notice v-else tone="warning">
          This upload adds <strong>{{ formatBytes(precheck.totalBytes) }}</strong> to a group already using
          <strong>{{ formatBytes(precheck.current.usedBytes) }}</strong>. It crosses the group quota of
          <strong>{{ formatBytes(precheck.projected.quotaBytes ?? 0) }}</strong> into the grace headroom. Uploads still succeed until the hard cap of
          <strong>{{ formatBytes(precheck.projected.ceilingBytes ?? 0) }}</strong>.
        </Notice>
        <p class="text-muted-foreground">Counters on remote nodes can lag, so these numbers are approximate.</p>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="precheck = null">Cancel</Button>
        <Button @click="confirmPrecheckUpload">Upload anyway</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
