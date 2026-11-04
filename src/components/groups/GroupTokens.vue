<script setup lang="ts">
// Tokens this node holds that grant access to the group, for its administrators.
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { ref, watch } from 'vue'
import { KeyRound } from '@lucide/vue'
import { useUserDirectory } from '@/composables/useUserDirectory'
import { refreshContext, sessionEpoch } from '@/composables/aruna/state'
import { listGroupTokens, revokeGroupToken, type GroupToken, type GroupTokenKind } from '@/lib/api'
import { stateVariant } from '@/lib/stateBadge'
import { errorMessage, formatDateTime, shortUserId } from '@/lib/utils'

const props = defineProps<{ groupId: string; reloadKey?: number }>()

const KIND_LABELS: Record<GroupTokenKind, string> = {
  session: 'Service account token',
  s3_credential: 'S3 key',
  s3_session: 'S3 session',
}

const { resolveUsers, cachedUser } = useUserDirectory()
const tokens = ref<GroupToken[] | null>(null)
const loadError = ref<string | null>(null)
const target = ref<GroupToken | null>(null)
const busy = ref(false)
const revokeError = ref<string | null>(null)
let generation = 0

async function load() {
  const current = ++generation
  const { epoch, client } = refreshContext()
  const groupId = props.groupId
  loadError.value = null
  try {
    const response = await listGroupTokens(groupId, client)
    if (current !== generation || epoch !== sessionEpoch.value) return
    tokens.value = response.tokens
    void resolveUsers(response.tokens.map((token) => token.owner))
  } catch (err) {
    if (current === generation && epoch === sessionEpoch.value) loadError.value = errorMessage(err)
  }
}

watch([() => props.groupId, () => props.reloadKey, sessionEpoch], () => {
  tokens.value = null
  void load()
}, { immediate: true })

function owner(token: GroupToken): string {
  return cachedUser(token.owner)?.name ?? shortUserId(token.owner)
}

function when(value: string | null): string {
  return value ? formatDateTime(value) : 'Unknown'
}

async function confirmRevoke() {
  const token = target.value
  if (!token || busy.value) return
  const { epoch, client } = refreshContext()
  busy.value = true
  revokeError.value = null
  try {
    await revokeGroupToken(props.groupId, token.kind, token.id, client)
    if (epoch !== sessionEpoch.value) return
    target.value = null
    await load()
  } catch (err) {
    if (epoch === sessionEpoch.value) revokeError.value = errorMessage(err)
  } finally {
    busy.value = false
  }
}

function statusLabel(token: GroupToken): string {
  return token.status.charAt(0).toUpperCase() + token.status.slice(1)
}
</script>

<template>
  <div>
    <div v-if="loadError" class="p-4"><Notice tone="error">{{ loadError }}</Notice></div>
    <div v-else-if="tokens === null" class="flex justify-center p-6"><Spinner label="Loading tokens" /></div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th scope="col" class="px-5 py-2 text-left font-semibold">Owner</th>
          <th scope="col" class="px-5 py-2 text-left font-semibold">Kind</th>
          <th scope="col" class="px-5 py-2 text-left font-semibold">Created</th>
          <th scope="col" class="px-5 py-2 text-left font-semibold">Last used</th>
          <th scope="col" class="px-5 py-2 text-left font-semibold">Expires</th>
          <th scope="col" class="px-5 py-2 text-left font-semibold">Status</th>
          <th scope="col" class="px-5 py-2 text-right font-semibold">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="token in tokens" :key="`${token.kind}/${token.id}`" class="border-t border-border">
          <td class="px-5 py-2.5 text-sm text-foreground">{{ owner(token) }}</td>
          <td class="px-5 py-2.5 text-xs">{{ KIND_LABELS[token.kind] }}</td>
          <td class="px-5 py-2.5 text-xs text-muted-foreground">{{ when(token.created_at) }}</td>
          <td class="px-5 py-2.5 text-xs text-muted-foreground">{{ when(token.last_used_at) }}</td>
          <td class="px-5 py-2.5 text-xs text-muted-foreground">{{ when(token.expires_at) }}</td>
          <td class="px-5 py-2.5"><Badge :variant="stateVariant(token.status)">{{ statusLabel(token) }}</Badge></td>
          <td class="px-5 py-2.5 text-right">
            <Button v-if="token.status === 'active'" variant="outline" size="sm" :disabled="busy" @click="target = token; revokeError = null">
              <KeyRound class="h-3.5 w-3.5" /> Revoke
            </Button>
          </td>
        </tr>
        <tr v-if="!tokens.length">
          <td colspan="7" class="px-5 py-6 text-center text-xs text-muted-foreground">This node holds no tokens for this group.</td>
        </tr>
      </tbody>
    </table>

    <ConfirmDialog
      :open="target !== null"
      title="Revoke this token"
      :description="target ? `${KIND_LABELS[target.kind]} of ${owner(target)}. It stops working at once.` : undefined"
      confirm-label="Revoke"
      :busy="busy"
      :error="revokeError"
      @update:open="(open) => { if (!open) target = null }"
      @confirm="confirmRevoke"
    />
  </div>
</template>
