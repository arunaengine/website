<script setup lang="ts">
// The rules this bucket puts on new objects. Policy only: what this node
// observed about existing objects lives in the compliance surface below.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Input from '@/components/ui/Input.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PlacementRuleEditor from '@/components/storage/PlacementRuleEditor.vue'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { useRefresh } from '@/composables/useRefresh'
import { ApiError } from '@/lib/api'
import {
  placementPoliciesErrorMessage,
  policyOwnerLabel,
  policyRefKey,
  policyRefProblems,
} from '@/lib/placementPolicies'
import type { BucketPlacementResponse, PolicyRefBody, PolicyResponse } from '@/lib/placementPolicies'
import { Plus, Save, ShieldCheck, Trash2 } from '@lucide/vue'

const props = defineProps<{
  bucket: string
  groupId: string | null
  groupName: string | null
  /** A group admin publishes for the group; a realm admin publishes realm wide. */
  canPublishForGroup: boolean
  canPublishForRealm: boolean
}>()
const emit = defineEmits<{ (event: 'saved'): void }>()

const { getBucketPlacement, putBucketPlacement, listPoliciesForGroup, policyName } =
  usePlacementPolicies()

const placement = ref<BucketPlacementResponse | null>(null)
const draft = ref<PolicyRefBody[]>([])
const library = ref<PolicyResponse[]>([])
const libraryRead = ref(false)
const loading = ref(false)
const refusal = ref<string | null>(null)
const loadError = ref<string | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)
const saveMessage = ref<string | null>(null)
const editorOpen = ref(false)
const attachChoice = ref('')

const saved = computed(() => placement.value?.policies ?? [])
const refErrors = computed(() => policyRefProblems(draft.value))
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(saved.value))
const ownerGroupId = computed(() => (props.canPublishForGroup ? props.groupId : null))
const ownerLabel = computed(() =>
  props.canPublishForGroup ? (props.groupName ?? 'This group') : 'Realm',
)
const canPublish = computed(() => props.canPublishForGroup || props.canPublishForRealm)

function ownerBadge(policy: { owner_group_id?: string | null }): string | undefined {
  return policyOwnerLabel(
    policy.owner_group_id,
    policy.owner_group_id && policy.owner_group_id === props.groupId ? props.groupName : null,
  )
}

const attachable = computed(() => {
  const attached = new Set(draft.value.map(policyRefKey))
  return library.value
    .filter((policy) => !attached.has(policyRefKey(policy)))
    .map((policy) => {
      const owner = ownerBadge(policy)
      return { value: policyRefKey(policy), label: owner ? `${policy.name} (${owner})` : policy.name }
    })
})

let sequence = 0
async function load() {
  const request = ++sequence
  loading.value = true
  refusal.value = null
  loadError.value = null
  saveError.value = null
  saveMessage.value = null
  try {
    const stored = await getBucketPlacement(props.bucket)
    if (request !== sequence) return
    placement.value = stored
    draft.value = stored.policies.map((policy) => ({ ...policy }))
  } catch (error) {
    if (request !== sequence) return
    placement.value = null
    draft.value = []
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      refusal.value =
        error.message
        || 'This node refused to show the placement policies of this bucket. Group admins of the bucket and realm admins may read them.'
    } else loadError.value = placementPoliciesErrorMessage(error)
  } finally {
    if (request === sequence) loading.value = false
  }
  await listPoliciesForGroup(props.groupId)
    .then((policies) => {
      if (request !== sequence) return
      library.value = policies
      libraryRead.value = true
    })
    .catch(() => {
      if (request === sequence) libraryRead.value = false
    })
}

const { busy: reloadBusy, refresh: onReload } = useRefresh(load)
const spinning = computed(() => reloadBusy.value || loading.value)

watch(() => [props.bucket, props.groupId], () => void load(), { immediate: true })

function attach(key: string) {
  attachChoice.value = ''
  const chosen = library.value.find((policy) => policyRefKey(policy) === key)
  if (!chosen) return
  draft.value = [
    ...draft.value,
    { policy_id: chosen.policy_id, digest: chosen.digest, name: chosen.name, owner_group_id: chosen.owner_group_id },
  ]
}

function detach(index: number) {
  draft.value = draft.value.filter((_, position) => position !== index)
}

function addRef() {
  draft.value = [...draft.value, { policy_id: '', digest: '' }]
}

function reset() {
  draft.value = saved.value.map((policy) => ({ ...policy }))
  saveError.value = null
  saveMessage.value = null
}

async function save() {
  if (!placement.value || refErrors.value.length || saving.value) return
  saving.value = true
  saveError.value = null
  saveMessage.value = null
  try {
    const stored = await putBucketPlacement(props.bucket, {
      policies: draft.value.map((policy) => ({
        policy_id: policy.policy_id.trim(),
        digest: policy.digest.trim(),
      })),
      expected_generation: placement.value.generation,
    })
    placement.value = stored
    draft.value = stored.policies.map((policy) => ({ ...policy }))
    saveMessage.value = stored.policies.length
      ? 'Saved. New objects in this bucket carry these rules.'
      : 'Saved. New objects in this bucket carry no rules.'
    emit('saved')
  } catch (error) {
    saveError.value = placementPoliciesErrorMessage(error, 'bucket-cas')
  } finally {
    saving.value = false
  }
}

function onPublished(policy: PolicyResponse) {
  editorOpen.value = false
  library.value = [...library.value, policy]
  draft.value = [
    ...draft.value,
    { policy_id: policy.policy_id, digest: policy.digest, name: policy.name, owner_group_id: policy.owner_group_id },
  ]
}
</script>

<template>
  <section class="surface">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
      <div class="flex items-center gap-2">
        <ShieldCheck class="size-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Where copies may be stored</h2>
      </div>
      <div class="flex items-center gap-2">
        <Button v-if="canPublish" variant="outline" size="sm" @click="editorOpen = true">
          <Plus class="size-3.5" /> New policy
        </Button>
        <RefreshButton :busy="spinning" :disabled="saving" sr-label="Reload the attached policies" @click="onReload" />
      </div>
    </header>

    <div class="space-y-4 px-5 py-4">
      <RefusalNote v-if="refusal" :message="refusal" />
      <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
      <div v-else-if="loading && !placement" class="space-y-2">
        <Skeleton class="h-10" />
        <Skeleton class="h-10" />
      </div>

      <template v-else-if="placement">
        <p class="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>A policy allows a copy. It never creates, moves or removes one.</span>
          <DocsLink topic="where-data-lives" section="Placement policies" label="Learn about placement policies" />
        </p>

        <ul v-if="draft.length" class="divide-y divide-border rounded-md border border-border">
          <li
            v-for="(policy, index) in draft"
            :key="index"
            class="flex items-center justify-between gap-2 px-3 py-2"
          >
            <div class="min-w-0">
              <p class="truncate text-sm text-foreground">
                {{ policyName(policy) || 'Unnamed reference' }}
              </p>
              <p class="text-[11px] text-muted-foreground">
                <Badge v-if="ownerBadge(policy)" variant="outline" size="sm">{{ ownerBadge(policy) }}</Badge>
                <span v-else>Owner not reported by this node</span>
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-destructive hover:text-destructive"
              :aria-label="`Remove policy ${index + 1}`"
              @click="detach(index)"
            >
              <Trash2 class="size-3.5" />
            </Button>
          </li>
        </ul>
        <p v-else class="text-sm text-muted-foreground">
          None: copies of this bucket are not governed.
        </p>

        <div class="flex flex-wrap items-center gap-2">
          <Select
            v-if="attachable.length"
            :model-value="attachChoice"
            :options="attachable"
            class="max-w-sm"
            placeholder="Attach a policy…"
            aria-label="Attach a placement policy"
            @update:model-value="attach"
          />
          <p v-else class="text-xs text-muted-foreground">
            {{
              libraryRead
                ? 'No further policy of this realm or group is available to attach here.'
                : 'This node lists no policies. Reference one by id and digest under Advanced.'
            }}
          </p>
        </div>

        <ul v-if="refErrors.length" class="list-disc space-y-1 pl-5 text-xs text-destructive">
          <li v-for="problem in refErrors" :key="problem">{{ problem }}</li>
        </ul>
        <RefusalNote v-if="saveError" :message="saveError" />
        <p v-else-if="saveMessage" class="text-xs text-emerald-700 dark:text-emerald-300">{{ saveMessage }}</p>

        <div class="flex flex-wrap items-center gap-2">
          <Button :disabled="saving || !dirty || refErrors.length > 0" @click="save">
            <Save class="size-3.5" /> {{ saving ? 'Saving…' : 'Save' }}
          </Button>
          <Button variant="outline" :disabled="saving || !dirty" @click="reset">Discard changes</Button>
          <span v-if="!dirty" class="text-[11px] text-muted-foreground">Nothing changed yet.</span>
        </div>
        <p class="text-[11px] text-muted-foreground">
          Saving replaces the whole set and governs objects written afterwards.
        </p>

        <details class="rounded-md border border-border px-3 py-2">
          <summary class="cursor-pointer text-xs font-medium text-foreground">Advanced</summary>
          <div class="mt-3 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-[11px] text-muted-foreground">
                A reference is the policy id plus the digest of its definition, for a policy this
                node does not list.
              </p>
              <Button variant="outline" size="sm" @click="addRef"><Plus class="size-3.5" /> Add reference</Button>
            </div>
            <div
              v-for="(policy, index) in draft"
              :key="index"
              class="grid gap-2 rounded-md border border-border bg-background p-3 md:grid-cols-[minmax(12rem,0.8fr)_minmax(20rem,1.4fr)]"
            >
              <div>
                <label class="text-[11px] font-medium text-foreground">Policy id</label>
                <Input
                  v-model="policy.policy_id"
                  class="mt-1 font-mono text-xs"
                  :aria-label="`Policy id ${index + 1}`"
                />
              </div>
              <div>
                <label class="text-[11px] font-medium text-foreground">Definition digest</label>
                <Input
                  v-model="policy.digest"
                  class="mt-1 font-mono text-xs"
                  :aria-label="`Digest of policy ${index + 1}`"
                />
              </div>
            </div>
            <p class="text-[11px] text-muted-foreground">
              Attached set generation {{ placement.generation }}. Saving checks it, so a change
              somebody else made is refused instead of overwritten.
            </p>
          </div>
        </details>
      </template>
    </div>

    <Dialog :open="editorOpen" @update:open="(value: boolean) => (editorOpen = value)">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New placement policy</DialogTitle>
          <DialogDescription>
            Published for {{ ownerLabel }} and attached to this bucket once it is saved.
          </DialogDescription>
        </DialogHeader>
        <PlacementRuleEditor
          :owner-group-id="ownerGroupId"
          :owner-label="ownerLabel"
          @published="onPublished"
        />
      </DialogContent>
    </Dialog>
  </section>
</template>
