<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import ComputeGates from '@/components/compute/ComputeGates.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import { activeGroupId } from '@/composables/useGroupSelection'
import { useNotebookLocation } from '@/composables/useNotebookLocation'
import { useS3 } from '@/composables/useS3'
import { featureEnabled } from '@/lib/config'
import { NOTEBOOK_PREFIX, notebookKey, notebookSlug } from '@/lib/notebook/document'
import { NotebookPen } from '@lucide/vue'

const router = useRouter()
const route = useRoute()
const saved = useNotebookLocation()
const initial = ref(saved.location.value)
watch(saved.scope, () => { initial.value = saved.location.value })
const s3 = useS3()
watch([saved.scope, () => route.query.browse, () => s3.activeContext.value], () => {
  if (route.query.browse === '1' || !saved.location.value?.key || s3.activeContext.value?.groupId !== activeGroupId.value) return
  void router.replace({ name: 'notebook', params: { bucketId: saved.location.value.bucket, key: saved.location.value.key }, query: { group: activeGroupId.value } })
}, { immediate: true })
const enabled = featureEnabled('tes')
const newNotebookOpen = ref(false)
const newNotebookName = ref('')
const bucket = ref('')
const groupId = ref('')
const notebookTarget = computed(() => notebookKey(notebookSlug(newNotebookName.value)))
const canCreate = computed(() => Boolean(
  newNotebookName.value.trim() &&
  s3.activeContext.value?.groupId === groupId.value &&
  s3.canWrite(bucket.value, notebookTarget.value),
))

watch(s3.activeContext, () => { newNotebookOpen.value = false })

function openNewNotebook(selectedBucket: string, selectedGroup: string) {
  if (!selectedBucket || !s3.canWrite(selectedBucket, NOTEBOOK_PREFIX)) return
  bucket.value = selectedBucket
  groupId.value = selectedGroup
  newNotebookName.value = ''
  newNotebookOpen.value = true
}

function openNotebook(entry: { bucket: string; key: string }) {
  const context = s3.activeContext.value
  if (!context) return
  void router.push({
    name: 'notebook',
    params: { bucketId: entry.bucket, key: entry.key },
    query: { group: context.groupId },
  })
}

function createNotebook() {
  if (!newNotebookOpen.value || !canCreate.value) return
  newNotebookOpen.value = false
  openNotebook({ bucket: bucket.value, key: notebookTarget.value })
}
</script>

<template>
  <div>
    <PageHeader eyebrow="Workspace" title="Notebooks" description="Open a notebook or start a new one in a bucket." />
    <ComputeGates
      :enabled="enabled"
      disabled-description="Notebook sessions are not enabled on this node."
      sign-in-title="Sign in to use notebooks"
      sign-in-description="Browse and create notebooks in your group's buckets."
      redirect-to="/app/notebooks"
    >
      <div class="container py-4">
        <ObjectBrowserPanel
          :key="saved.scope.value"
          notebooks-only
          :initial-bucket="initial?.bucket"
          :prefix="initial?.prefix"
          :group-id="activeGroupId"
          @navigate="saved.remember($event)"
          @select="openNotebook"
        >
          <template #actions="{ bucket: selectedBucket, groupId: selectedGroup, ready }">
            <Button
              size="sm"
              :disabled="!ready || !selectedBucket || !s3.canWrite(selectedBucket, NOTEBOOK_PREFIX)"
              @click="openNewNotebook(selectedBucket, selectedGroup)"
            ><NotebookPen class="h-4 w-4" /> New notebook</Button>
          </template>
        </ObjectBrowserPanel>
      </div>
    </ComputeGates>
    <Dialog :open="newNotebookOpen" @update:open="(value: boolean) => (newNotebookOpen = value)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>New notebook</DialogTitle>
          <DialogDescription>
            Opens <span class="font-mono text-xs">{{ notebookTarget }}</span> in
            <span class="font-mono text-xs">{{ bucket }}</span>. The file is written on the first save.
          </DialogDescription>
        </DialogHeader>
        <Input v-model="newNotebookName" aria-label="Notebook name" placeholder="first-look" class="font-mono text-xs" @keyup.enter="createNotebook" />
        <DialogFooter>
          <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
          <Button :disabled="!canCreate" @click="createNotebook">Open</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
