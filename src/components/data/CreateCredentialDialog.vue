<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import CopyButton from '@/components/nodes/CopyButton.vue'
import { computed, ref, watch } from 'vue'
import { KeyRound, ShieldAlert } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useS3 } from '@/composables/useS3'
import type { CreateS3CredentialsResponse } from '@/lib/api'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'activated'): void
}>()

const { myGroups, saving, createS3Credentials } = useAruna()
const { endpoint, setActiveKey } = useS3()

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

const groupOptions = computed(() =>
  myGroups.value.map((group) => ({ value: group.id, label: group.name })),
)

const cliSnippet = computed(() => {
  if (!created.value) return ''
  return [
    `export AWS_ACCESS_KEY_ID=${created.value.access_key_id}`,
    `export AWS_SECRET_ACCESS_KEY=${created.value.access_secret}`,
    `aws s3 ls --endpoint-url ${endpoint.value ?? '<s3-endpoint>'}`,
  ].join('\n')
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    groupId.value = myGroups.value[0]?.id ?? ''
    expiresIn.value = '2592000'
    submitError.value = null
    created.value = null
  },
)

async function submit() {
  if (!groupId.value) return
  submitError.value = null
  try {
    created.value = await createS3Credentials({
      group_id: groupId.value,
      expires_in_seconds: Number(expiresIn.value),
    })
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err)
  }
}

function activate() {
  if (!created.value) return
  setActiveKey({
    accessKeyId: created.value.access_key_id,
    secretAccessKey: created.value.access_secret,
  })
  emit('activated')
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <KeyRound class="h-4 w-4 text-primary" /> Create S3 credentials
        </DialogTitle>
        <DialogDescription>
          The key is scoped to one group and works with any S3 client against this node.
        </DialogDescription>
      </DialogHeader>

      <div v-if="!created" class="space-y-3">
        <div>
          <label class="text-xs font-medium text-foreground">Group</label>
          <Select v-model="groupId" :options="groupOptions" placeholder="Select a group" class="mt-1" />
          <p v-if="!groupOptions.length" class="mt-1 text-xs text-muted-foreground">
            You are not a member of any group yet. Create one under Groups first.
          </p>
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Expires after</label>
          <Select v-model="expiresIn" :options="EXPIRY_OPTIONS" class="mt-1" />
        </div>
        <p v-if="submitError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {{ submitError }}
        </p>
      </div>

      <div v-else class="space-y-3">
        <div class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>The secret is shown once. Copy it now; it cannot be retrieved later.</span>
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
          <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
          <Button :disabled="saving || !groupId" @click="submit">{{ saving ? 'Creating…' : 'Create' }}</Button>
        </template>
        <template v-else>
          <DialogClose><Button variant="outline">Close</Button></DialogClose>
          <Button @click="activate">Use in browser</Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
