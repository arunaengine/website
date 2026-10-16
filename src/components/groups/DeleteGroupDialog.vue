<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Trash2 } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { ApiError, sortDeletionCheck, type DeletionCheck } from '@/lib/api'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{ open: boolean; groupId: string }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'deleted'): void
}>()

const { getGroupDeletionBlockers, deleteGroup, saving } = useAruna()
const { displayName, isLocalNode } = useRealmNodes()
const { writesDisabled } = useConnectivity()

const check = ref<DeletionCheck | null>(null)
const checking = ref(false)
const checkError = ref<string | null>(null)
// Older nodes answer 404 for the route; deleting then works as before.
const unavailable = ref(false)
const refusal = ref<string | null>(null)
// Local, so a second click cannot start a second delete before `saving` renders.
const deleting = ref(false)
let checkSeq = 0

const canDelete = computed(() => unavailable.value || Boolean(check.value?.clear))
const hint = computed(() => {
  if (canDelete.value) return 'Deleting a group cannot be undone.'
  if (check.value && check.value.blocking.length > 0) return 'Remove everything above first.'
  if (check.value) return 'Every node must answer first.'
  return null
})

async function runCheck() {
  const seq = ++checkSeq
  checking.value = true
  checkError.value = null
  try {
    const response = await getGroupDeletionBlockers(props.groupId)
    if (seq !== checkSeq) return
    check.value = sortDeletionCheck(response)
    unavailable.value = false
  } catch (err) {
    if (seq !== checkSeq) return
    check.value = null
    unavailable.value = err instanceof ApiError && err.status === 404
    if (!unavailable.value) checkError.value = errorMessage(err)
  } finally {
    if (seq === checkSeq) checking.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    check.value = null
    unavailable.value = false
    refusal.value = null
    void runCheck()
  },
  { immediate: true },
)

// The node names what the group still owns, e.g. "group is not empty: node 01X: S3 buckets".
function deleteMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 409 && err.message.startsWith('group is not empty:')) {
    const reason = err.message.slice('group is not empty:'.length).replace(/^\s*node \S+:/, '').trim()
    return `This group still has: ${reason}.`
  }
  if (err instanceof ApiError && err.status === 503) return 'A node of this realm is not reachable. Try again later.'
  return errorMessage(err)
}

async function remove() {
  if (deleting.value) return
  deleting.value = true
  refusal.value = null
  try {
    await deleteGroup(props.groupId)
    emit('update:open', false)
    emit('deleted')
  } catch (err) {
    refusal.value = deleteMessage(err)
    if (!unavailable.value) void runCheck()
  } finally {
    deleting.value = false
  }
}

function bucketRoute(nodeId: string, bucket: string) {
  const query = { ...(isLocalNode(nodeId) ? {} : { node: nodeId }), group: props.groupId }
  return { name: 'bucket', params: { bucketId: bucket }, query }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Trash2 class="h-4 w-4 text-destructive" /> Delete group?
        </DialogTitle>
        <DialogDescription v-if="unavailable">This only works when the group is empty.</DialogDescription>
        <DialogDescription v-else-if="check && check.blocking.length > 0">
          These must be removed before the group can be deleted.
        </DialogDescription>
        <DialogDescription v-else-if="check?.clear">Nothing blocks deletion.</DialogDescription>
      </DialogHeader>

      <div class="space-y-2">
        <Spinner v-if="checking && !check" show-label label="Checking what blocks deletion…" />
        <Notice v-if="checkError" tone="error">{{ checkError }}</Notice>
        <template v-if="check">
          <div
            v-for="node in check.blocking"
            :key="node.node_id"
            class="rounded-md border border-border px-3 py-2 text-xs"
          >
            <NodeLabel :node-id="node.node_id" class="font-semibold text-foreground" />
            <ul class="mt-1 space-y-0.5 text-foreground">
              <li v-for="kind in node.kinds" :key="kind">
                {{ kind }}<template v-if="kind === 'S3 buckets' && node.buckets.length > 0">:
                  <template v-for="(bucket, index) in node.buckets" :key="bucket">
                    <RouterLink
                      :to="bucketRoute(node.node_id, bucket)"
                      class="font-mono text-primary hover:underline"
                    >{{ bucket }}</RouterLink><template v-if="index < node.buckets.length - 1">, </template>
                  </template>
                  <template v-if="node.more">, and more</template>
                </template>
              </li>
            </ul>
          </div>
          <div
            v-for="node in check.unanswered"
            :key="node.node_id"
            class="rounded-md border border-border px-3 py-2 text-xs"
          >
            <NodeLabel :node-id="node.node_id" class="font-semibold text-foreground" />
            <p class="mt-1 text-muted-foreground">This node did not answer. Check again later.</p>
          </div>
          <p v-if="check.empty.length > 0" class="text-xs text-muted-foreground">
            Nothing left on: {{ check.empty.map((id) => displayName(id)).join(', ') }}
          </p>
        </template>
        <Notice v-if="refusal" tone="error">{{ refusal }}</Notice>
      </div>

      <DialogFooter>
        <p v-if="hint" class="mr-auto self-center text-xs text-muted-foreground">{{ hint }}</p>
        <RefreshButton v-if="!unavailable" :busy="checking" label="Check again" @click="runCheck" />
        <DialogClose as-child><Button variant="outline">Close</Button></DialogClose>
        <Button
          variant="destructive"
          :disabled="!canDelete || checking || deleting || saving || writesDisabled"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          @click="remove"
        >
          <Spinner v-if="deleting" label="Deleting…" /> Delete group
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
