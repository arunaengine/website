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
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import SecretPanel from '@/components/onboarding/SecretPanel.vue'
import { computed, ref, watch } from 'vue'
import { ChevronRight, Code2, KeyRound, Plus, ShieldAlert, X } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useS3 } from '@/composables/useS3'
import { useUserSessions } from '@/composables/useUserSessions'
import { errorMessage } from '@/lib/utils'
import type { CreateS3CredentialsResponse, CreateSessionResponse } from '@/lib/api'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
}>()

const { myGroups, userInfo, saving, createS3Credentials } = useAruna()
const { connectedEndpoint } = useS3()
const { create: createUserSession } = useUserSessions()

type CredentialKind = 's3' | 'bearer'

const KIND_OPTIONS: Array<{ value: CredentialKind; title: string; hint: string; icon: unknown }> = [
  { value: 's3', title: 'S3 access key', hint: 'S3 clients and the TES facade', icon: KeyRound },
  { value: 'bearer', title: 'Bearer token', hint: 'The REST API of this node', icon: Code2 },
]

// The node caps a session at the caller's remaining lifetime and at 24 hours.
const TOKEN_EXPIRY_OPTIONS = [
  { value: '3600', label: '1 hour' },
  { value: '28800', label: '8 hours' },
  { value: '86400', label: '24 hours' },
]

const EXPIRY_OPTIONS = [
  { value: '3600', label: '1 hour' },
  { value: '86400', label: '1 day' },
  { value: '604800', label: '7 days' },
  { value: '2592000', label: '30 days' },
  { value: '31536000', label: '1 year' },
]

const kind = ref<CredentialKind>('s3')
const groupId = ref('')
const expiresIn = ref('2592000')
const submitError = ref<string | null>(null)
const created = ref<CreateS3CredentialsResponse | null>(null)
const createGroupOpen = ref(false)
const tokenLabel = ref('')
const tokenExpiresIn = ref('86400')
const tokenBusy = ref(false)
const createdToken = ref<CreateSessionResponse | null>(null)

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

const dialogTitle = computed(() => (kind.value === 's3' ? 'Create an S3 access key' : 'Create a bearer token'))
const dialogDescription = computed(() =>
  kind.value === 's3'
    ? 'A long-lived, group-scoped key for S3 clients and the TES facade on this node. Portal browsing uses temporary sessions instead.'
    : 'A bearer token for the REST API of this node, listed and revocable under Sessions. It cannot sign S3 requests.',
)

const tokenExpiresAt = computed(() => {
  const at = Date.parse(createdToken.value?.expires_at ?? '')
  return Number.isFinite(at) ? Math.floor(at / 1000) : null
})

watch(
  () => props.open,
  (open) => {
    if (!open) {
      created.value = null
      createdToken.value = null
      return
    }
    kind.value = 's3'
    groupId.value = ''
    expiresIn.value = '2592000'
    submitError.value = null
    created.value = null
    createdToken.value = null
    tokenLabel.value = ''
    tokenExpiresIn.value = '86400'
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
    submitError.value = errorMessage(err)
  }
}

async function submitToken() {
  const label = tokenLabel.value.trim()
  if (!label || tokenBusy.value) return
  submitError.value = null
  tokenBusy.value = true
  try {
    createdToken.value = await createUserSession({
      kind: 'api',
      label,
      expires_in_seconds: Number(tokenExpiresIn.value),
    })
  } catch (err) {
    submitError.value = errorMessage(err)
  } finally {
    tokenBusy.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <component :is="kind === 's3' ? KeyRound : Code2" class="h-4 w-4 text-primary" /> {{ dialogTitle }}
        </DialogTitle>
        <DialogDescription>{{ dialogDescription }}</DialogDescription>
      </DialogHeader>

      <div v-if="!created && !createdToken" class="space-y-3">
        <div class="grid gap-2 sm:grid-cols-2">
          <button
            v-for="option in KIND_OPTIONS"
            :key="option.value"
            type="button"
            class="flex items-start gap-2 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/40"
            :class="kind === option.value ? 'border-primary/60 ring-1 ring-primary/30' : ''"
            @click="((kind = option.value), (submitError = null))"
          >
            <component :is="option.icon" class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span class="min-w-0">
              <span class="block text-sm font-medium text-foreground">{{ option.title }}</span>
              <span class="block text-[11px] text-muted-foreground">{{ option.hint }}</span>
            </span>
          </button>
        </div>

        <template v-if="kind === 'bearer'">
          <div>
            <label class="text-xs font-medium text-foreground">Label</label>
            <Input v-model="tokenLabel" class="mt-1" placeholder="What will use this token" />
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Expires after</label>
            <Select v-model="tokenExpiresIn" :options="TOKEN_EXPIRY_OPTIONS" class="mt-1" />
            <p class="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              A day is the maximum. The node shortens it further when your own sign-in expires sooner.
            </p>
          </div>
        </template>

        <template v-else>
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
        </template>

        <Notice v-if="submitError" tone="error">
          {{ submitError }}
        </Notice>
      </div>

      <div v-else-if="created" class="space-y-3">
        <Notice tone="warning" class="flex items-start gap-2">
          <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>The secret is shown once and cannot be retrieved later. The portal never stores or uses this key.</span>
        </Notice>
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

      <div v-else class="space-y-3">
        <SecretPanel
          :secret="createdToken?.token ?? ''"
          secret-label="Bearer token"
          :expires-at="tokenExpiresAt"
          notice="The token is shown once and cannot be retrieved later. The portal never stores it."
        />
        <p class="text-[11px] leading-relaxed text-muted-foreground">
          Send it as <code class="font-mono">Authorization: Bearer …</code> to the REST API of this node. It does not sign
          S3 requests. The session it belongs to is listed under Sessions, where you can revoke it.
        </p>
      </div>

      <DialogFooter>
        <template v-if="!created && !createdToken">
          <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
          <Button v-if="kind === 's3'" :disabled="saving || !groupId" @click="submit">{{ saving ? 'Creating…' : 'Create' }}</Button>
          <Button v-else :disabled="tokenBusy || !tokenLabel.trim()" @click="submitToken">{{ tokenBusy ? 'Creating…' : 'Create' }}</Button>
        </template>
        <template v-else>
          <DialogClose as-child><Button>Close</Button></DialogClose>
        </template>
      </DialogFooter>

      <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => (groupId = group.group_id)" />
    </DialogContent>
  </Dialog>
</template>
