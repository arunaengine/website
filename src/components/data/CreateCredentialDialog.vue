<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import CopyButton from '@/components/nodes/CopyButton.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import { computed, ref, watch } from 'vue'
import { ChevronRight, KeyRound, Plus, ShieldAlert, X } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useS3 } from '@/composables/useS3'
import type { CreateS3CredentialsResponse } from '@/lib/api'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
}>()

const { myGroups, userInfo, saving, createS3Credentials } = useAruna()
const { connectedEndpoint } = useS3()

const EXPIRY_OPTIONS = [
  { value: '3600', label: '1 hour' },
  { value: '86400', label: '1 day' },
  { value: '604800', label: '7 days' },
  { value: '2592000', label: '30 days' },
  { value: '31536000', label: '1 year' },
]

const groupId = ref('')
const expiresIn = ref('2592000')
const submitError = ref<string | null>(null)
const created = ref<CreateS3CredentialsResponse | null>(null)
const createGroupOpen = ref(false)

interface Restriction {
  pattern: string
  permission: string
}
const restrictions = ref<Restriction[]>([])
const showRestrictions = ref(false)
const PERMISSION_OPTIONS = [
  { value: 'read', label: 'read' },
  { value: 'write', label: 'write' },
  { value: 'deny', label: 'deny' },
]

function addRestriction() {
  restrictions.value.push({ pattern: '', permission: 'read' })
}

function removeRestriction(index: number) {
  restrictions.value.splice(index, 1)
}

function hasWriteAccess(groupId: string): boolean {
  const group = userInfo.value?.groups.find((entry) => entry.group_id === groupId)
  return Boolean(
    group?.roles.some((role) =>
      Object.values(role.permissions).some((permission) => permission.toLowerCase() === 'write'),
    ),
  )
}

const groupOptions = computed(() =>
  myGroups.value.map((group) => ({
    value: group.id,
    label: hasWriteAccess(group.id) ? group.name : `${group.name} (no write access)`,
  })),
)

const cliSnippet = computed(() => {
  if (!created.value) return ''
  return [
    `export AWS_ACCESS_KEY_ID=${created.value.access_key_id}`,
    `export AWS_SECRET_ACCESS_KEY=${created.value.access_secret}`,
    `aws s3 ls --endpoint-url ${connectedEndpoint.value ?? '<s3-endpoint>'}`,
    `s5cmd --endpoint-url ${connectedEndpoint.value ?? '<s3-endpoint>'} ls`,
  ].join('\n')
})

watch(
  () => props.open,
  (open) => {
    if (!open) {
      created.value = null
      return
    }
    groupId.value = ''
    expiresIn.value = '2592000'
    submitError.value = null
    created.value = null
    restrictions.value = []
    showRestrictions.value = false
  },
)

async function submit() {
  if (!groupId.value) return
  submitError.value = null
  // Only send restrictions that actually specify a pattern; the backend
  // normalizes and validates them (a 400/403 surfaces via submitError).
  const active = restrictions.value
    .filter((r) => r.pattern.trim())
    .map((r) => ({ pattern: r.pattern.trim(), permission: r.permission }))
  try {
    created.value = await createS3Credentials({
      group_id: groupId.value,
      expires_in_seconds: Number(expiresIn.value),
      ...(active.length ? { path_restrictions: active } : {}),
    })
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <KeyRound class="h-4 w-4 text-primary" /> Create CLI or service key
        </DialogTitle>
        <DialogDescription>
          Create a long-lived, group-scoped key for an S3 client against this node. Portal browsing uses temporary sessions instead.
        </DialogDescription>
      </DialogHeader>

      <div v-if="!created" class="space-y-3">
        <div>
          <label class="text-xs font-medium text-foreground">Group</label>
          <GroupSelect v-model="groupId" :options="groupOptions" placeholder="Select a group" class="mt-1">
            <template #action>
              <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="createGroupOpen = true">
                <Plus class="h-3.5 w-3.5" /> Create a group
              </Button>
            </template>
          </GroupSelect>
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Expires after</label>
          <Select v-model="expiresIn" :options="EXPIRY_OPTIONS" class="mt-1" />
        </div>
        <div>
          <button
            type="button"
            class="flex items-center gap-1 text-xs font-medium text-foreground/80 hover:text-foreground"
            @click="showRestrictions = !showRestrictions"
          >
            <ChevronRight :class="['h-3.5 w-3.5 transition-transform', showRestrictions && 'rotate-90']" />
            Path restrictions (optional)
          </button>
          <div v-if="showRestrictions" class="mt-2 space-y-2">
            <div v-for="(restriction, index) in restrictions" :key="index" class="flex items-center gap-2">
              <Input v-model="restriction.pattern" class="font-mono text-xs" placeholder="datasets/** or /abs/path/**" />
              <Select v-model="restriction.permission" :options="PERMISSION_OPTIONS" class="w-28 shrink-0" />
              <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" aria-label="Remove restriction" @click="removeRestriction(index)">
                <X class="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button variant="outline" size="sm" @click="addRestriction"><Plus class="h-3.5 w-3.5" /> Add restriction</Button>
            <p class="text-[11px] leading-relaxed text-muted-foreground">
              Patterns are S3 key paths. Relative patterns are scoped under the group root. Only a trailing <code class="font-mono">/**</code> wildcard is supported; other wildcards are rejected. Without restrictions the key gets the group's full access.
            </p>
          </div>
        </div>
        <p v-if="submitError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {{ submitError }}
        </p>
      </div>

      <div v-else class="space-y-3">
        <div class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>The secret is shown once and cannot be retrieved later. The portal never stores or uses this key.</span>
        </div>
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <div class="min-w-0">
              <div class="text-[10px] uppercase tracking-wider text-muted-foreground">Access key ID</div>
              <div class="break-all font-mono text-xs">{{ created.access_key_id }}</div>
            </div>
            <CopyButton :value="created.access_key_id" label="Copy access key ID" />
          </div>
          <div class="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <div class="min-w-0">
              <div class="text-[10px] uppercase tracking-wider text-muted-foreground">Secret access key</div>
              <div class="break-all font-mono text-xs">{{ created.access_secret }}</div>
            </div>
            <CopyButton :value="created.access_secret" label="Copy secret access key" />
          </div>
          <div class="relative rounded-md border border-border bg-muted/40 px-3 py-2">
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground">CLI usage</div>
            <pre class="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] leading-5">{{ cliSnippet }}</pre>
            <div class="absolute right-2 top-2"><CopyButton :value="cliSnippet" label="Copy CLI snippet" /></div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <template v-if="!created">
          <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
          <Button :disabled="saving || !groupId" @click="submit">{{ saving ? 'Creating…' : 'Create' }}</Button>
        </template>
        <template v-else>
          <DialogClose as-child><Button>Close</Button></DialogClose>
        </template>
      </DialogFooter>

      <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => (groupId = group.group_id)" />
    </DialogContent>
  </Dialog>
</template>
