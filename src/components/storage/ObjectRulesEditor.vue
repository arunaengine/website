<script setup lang="ts">
// Per-file placement rules (decision Q33). Saving mints a successor version
// that carries exactly the chosen set; the versions before it keep theirs.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { ApiError, type GroupDetailResponse } from '@/lib/api'
import { isGroupAdmin } from '@/lib/groupAdmin'
import {
  createOperationId,
  placementPoliciesErrorMessage,
  policyOwnerLabel,
  policyRefKey,
} from '@/lib/placementPolicies'
import type { PolicyRefBody, PolicyResponse } from '@/lib/placementPolicies'
import { ShieldCheck, Trash2 } from '@lucide/vue'

const props = defineProps<{
  bucket: string
  objectKey: string
  /** The head this file has here; without one there is nothing to edit. */
  versionId: string | null
  groupId: string | null
  nodeId?: string | null
}>()
const emit = defineEmits<{ (e: 'saved'): void }>()

const { currentUser, getGroup, isRealmAdmin } = useAruna()
const { getObjectPlacement, listPoliciesForGroup, mintObjectPlacement, policyName } =
  usePlacementPolicies()

const group = ref<GroupDetailResponse | null>(null)
const groupFailed = ref(false)
const open = ref(false)
const loading = ref(false)
const draft = ref<PolicyRefBody[]>([])
const library = ref<PolicyResponse[]>([])
const libraryError = ref<string | null>(null)
const head = ref<{ versionId: string; generation: number } | null>(null)
const unavailable = ref<string | null>(null)
const attachChoice = ref('')
const saving = ref(false)
const refusal = ref<string | null>(null)
const saved = ref<string | null>(null)

async function loadGroup() {
  const id = props.groupId
  group.value = null
  groupFailed.value = false
  if (!id) return
  try {
    group.value = await getGroup(id)
  } catch {
    groupFailed.value = true
  }
}

watch(() => props.groupId, () => void loadGroup(), { immediate: true })

// Whoever may attach rules to the bucket may set them per file: realm admins,
// and group admins of the group that owns the bucket. An unread group is not a
// refusal: the node decides when the change is saved.
const blocked = computed<string | null>(() => {
  if (props.nodeId) return 'Only the node that holds this bucket can change the rules of its files.'
  if (!props.versionId) return 'This file has no current version on this node, so it carries no rules yet.'
  if (isRealmAdmin.value || groupFailed.value || !group.value) return null
  return isGroupAdmin(group.value, currentUser.value?.id ?? '')
    ? null
    : 'Only group admins of this bucket and realm admins may change the rules of a file.'
})

const attachable = computed(() => {
  const attached = new Set(draft.value.map(policyRefKey))
  return library.value
    .filter((policy) => !attached.has(policyRefKey(policy)))
    .map((policy) => {
      const owner = ownerLabel(policy)
      return { value: policyRefKey(policy), label: owner ? `${policy.name} (${owner})` : policy.name }
    })
})

function ownerLabel(policy: { owner_group_id?: string | null }): string | undefined {
  return policyOwnerLabel(
    policy.owner_group_id,
    policy.owner_group_id && policy.owner_group_id === props.groupId
      ? (group.value?.display_name ?? null)
      : null,
  )
}

// The head this node holds decides everything: the rules it already carries and
// the version and generation the successor has to be minted against.
async function load() {
  loading.value = true
  refusal.value = null
  saved.value = null
  unavailable.value = null
  attachChoice.value = ''
  head.value = null
  draft.value = []
  try {
    const placement = await getObjectPlacement(props.bucket, props.objectKey)
    head.value = { versionId: placement.version_id, generation: placement.generation }
    draft.value = placement.policies.map((policy) => ({ ...policy }))
  } catch (error) {
    unavailable.value =
      error instanceof ApiError && error.status === 404
        ? 'This file has no current version on this node.'
        : placementPoliciesErrorMessage(error, 'lookup')
  }
  await loadLibrary()
  loading.value = false
}

// A failed listing is said out loud: an empty one would claim the realm has no
// policy to attach.
async function loadLibrary() {
  libraryError.value = null
  try {
    library.value = await listPoliciesForGroup(props.groupId)
  } catch (error) {
    library.value = []
    libraryError.value = placementPoliciesErrorMessage(error, 'lookup')
  }
}

function start() {
  open.value = true
  // A transient failure must not keep a group admin locked out.
  if (groupFailed.value) void loadGroup()
  void load()
}

function attach(key: string) {
  attachChoice.value = ''
  const chosen = library.value.find((policy) => policyRefKey(policy) === key)
  if (!chosen) return
  draft.value = [
    ...draft.value,
    {
      policy_id: chosen.policy_id,
      digest: chosen.digest,
      name: chosen.name,
      owner_group_id: chosen.owner_group_id,
    },
  ]
}

function detach(index: number) {
  draft.value = draft.value.filter((_, position) => position !== index)
}

async function save() {
  const current = head.value
  if (!current || saving.value) return
  saving.value = true
  refusal.value = null
  saved.value = null
  try {
    const response = await mintObjectPlacement(props.bucket, {
      key: props.objectKey,
      mutation_id: createOperationId(),
      expected_version_id: current.versionId,
      expected_generation: current.generation,
      policies: draft.value.map((policy) => ({
        policy_id: policy.policy_id,
        digest: policy.digest,
      })),
    })
    if (response.outcome === 'blocked') {
      refusal.value = `This node wrote nothing: ${response.blocked_reason ?? 'it does not admit the file under these rules'}.`
      return
    }
    saved.value = 'Saved. This file now has a new version carrying exactly these rules.'
    emit('saved')
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      refusal.value =
        'This file changed while the rules were open.\nClose this dialog, reopen it and choose the rules again.'
    } else if (error instanceof ApiError && error.status === 403) {
      refusal.value = `This node refused the change.\n${error.message}`
    } else {
      refusal.value = placementPoliciesErrorMessage(error)
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <Button
      variant="outline"
      size="sm"
      :disabled="Boolean(blocked)"
      :title="blocked ?? 'Edit rules for this file'"
      @click="start"
    >
      <ShieldCheck class="size-3.5" /> Edit rules for this file…
    </Button>
    <RefusalNote v-if="blocked" :message="blocked" tone="warning" class="mt-2" />

    <Dialog :open="open" @update:open="(value: boolean) => (open = value)">
      <DialogContent class="max-w-xl">
        <DialogHeader>
          <DialogTitle>Rules for this file</DialogTitle>
          <DialogDescription>
            Saving creates a new version of this file that carries exactly these rules; older
            versions keep theirs.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-3 text-xs">
          <template v-if="loading">
            <Skeleton class="h-8" />
            <Skeleton class="h-8" />
          </template>
          <RefusalNote v-else-if="unavailable" :message="unavailable" />
          <template v-else>
            <ul v-if="draft.length" class="divide-y divide-border rounded-md border border-border">
              <li
                v-for="(policy, index) in draft"
                :key="policyRefKey(policy)"
                class="flex items-center justify-between gap-2 px-3 py-2"
              >
                <span class="min-w-0 truncate text-foreground">
                  {{ policyName(policy) }}
                  <Badge v-if="ownerLabel(policy)" variant="outline" size="sm" class="ml-1">
                    {{ ownerLabel(policy) }}
                  </Badge>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-destructive hover:text-destructive"
                  :aria-label="`Remove rule ${index + 1}`"
                  @click="detach(index)"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </li>
            </ul>
            <p v-else class="text-muted-foreground">
              None: copies of this file would not be governed.
            </p>

            <div v-if="libraryError" class="space-y-2">
              <RefusalNote :message="libraryError" tone="warning" />
              <Button variant="outline" size="sm" @click="loadLibrary">Try again</Button>
            </div>
            <Select
              v-else-if="attachable.length"
              :model-value="attachChoice"
              :options="attachable"
              class="max-w-sm"
              placeholder="Add a rule…"
              aria-label="Add a placement policy to this file"
              @update:model-value="attach"
            />
            <p v-else class="text-muted-foreground">
              No further policy of this realm or group is available here.
            </p>

            <p class="text-muted-foreground">
              A copy has to be allowed by all of them.
              <DocsLink icon topic="where-data-lives" section="Placement policies" class="ml-0.5" />
            </p>
          </template>

          <RefusalNote v-if="refusal" :message="refusal" />
          <p v-else-if="saved" class="text-emerald-700 dark:text-emerald-300">{{ saved }}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" :disabled="saving" @click="open = false">Close</Button>
          <Button :disabled="saving || loading || !head" @click="save">
            {{ saving ? 'Saving…' : 'Save rules' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
