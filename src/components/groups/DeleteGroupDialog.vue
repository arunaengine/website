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
import { removeBucket } from '@/components/groups/bucketRemoval'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { ApiError, sortDeletionCheck, type DeletionCheck, type NodeDeletionBlockers } from '@/lib/api'
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
// The bucket waiting for its inline confirmation, the one being deleted, and its failure.
const confirming = ref<string | null>(null)
const removing = ref<string | null>(null)
const removeError = ref<{ key: string; message: string } | null>(null)
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
    confirming.value = null
    removeError.value = null
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

const bucketKey = (nodeId: string, bucket: string) => `${nodeId}/${bucket}`

// Bucket names replace the plain "S3 buckets" line; without names it stays.
function otherKinds(node: NodeDeletionBlockers): string[] {
  const named = node.buckets.length > 0 || (node.hidden ?? 0) > 0
  return node.kinds.filter((kind) => !(named && kind === 'S3 buckets'))
}

async function removeOne(nodeId: string, bucket: string) {
  if (removing.value || writesDisabled.value) return
  const key = bucketKey(nodeId, bucket)
  removing.value = key
  removeError.value = null
  try {
    await removeBucket(nodeId, bucket)
    confirming.value = null
    await runCheck()
  } catch (err) {
    removeError.value = { key, message: errorMessage(err) }
  } finally {
    removing.value = null
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
            <ul v-if="otherKinds(node).length > 0" class="mt-1 space-y-0.5 text-foreground">
              <li v-for="kind in otherKinds(node)" :key="kind">{{ kind }}</li>
            </ul>
            <ul v-if="node.buckets.length > 0" class="mt-1 space-y-1">
              <li v-for="bucket in node.buckets" :key="bucket">
                <div class="flex items-center gap-2">
                  <span class="min-w-0 flex-1 truncate font-mono text-foreground">{{ bucket }}</span>
                  <RouterLink :to="bucketRoute(node.node_id, bucket)" class="text-primary hover:underline">Open</RouterLink>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-6 px-2 text-xs text-destructive"
                    :aria-label="`Delete ${bucket}`"
                    :disabled="Boolean(removing) || writesDisabled"
                    @click="confirming = bucketKey(node.node_id, bucket)"
                  >
                    Delete
                  </Button>
                </div>
                <div
                  v-if="confirming === bucketKey(node.node_id, bucket)"
                  class="mt-1 rounded-md border border-destructive/40 bg-destructive/5 p-2"
                >
                  <p class="text-foreground">
                    Delete {{ bucket }} and all its files on {{ displayName(node.node_id) }}? This cannot be undone.
                  </p>
                  <div class="mt-2 flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      class="h-6 px-2 text-xs"
                      :aria-label="`Confirm delete ${bucket}`"
                      :disabled="Boolean(removing) || writesDisabled"
                      @click="removeOne(node.node_id, bucket)"
                    >
                      <Spinner v-if="removing === bucketKey(node.node_id, bucket)" label="Deleting…" /> Delete
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      class="h-6 px-2 text-xs"
                      :disabled="Boolean(removing)"
                      @click="confirming = null"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
                <p v-if="removeError?.key === bucketKey(node.node_id, bucket)" class="mt-1 text-destructive">
                  {{ removeError.message }}
                </p>
              </li>
            </ul>
            <p v-if="node.more" class="mt-1 text-muted-foreground">More buckets are not shown.</p>
            <p v-if="node.hidden" class="mt-1 text-muted-foreground">
              {{ node.hidden }} {{ node.hidden === 1 ? 'bucket' : 'buckets' }} you cannot access
            </p>
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
