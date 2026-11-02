<script setup lang="ts">
// Every share link of this account. Links live on the node that holds their data and there is
// no realm index, so each realm node is asked; a node that does not answer is named, not hidden.
import { computed, ref, watch } from 'vue'
import { Copy, Ellipsis, Link2 } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import ListPager from '@/components/ui/ListPager.vue'
import Notice from '@/components/ui/Notice.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import ShareLogDialog from '@/components/settings/ShareLogDialog.vue'
import { nodeApiBase } from '@/components/nodes/node-probe'
import { useAruna } from '@/composables/useAruna'
import { linkFor, shareClient, shareErrorMessage } from '@/composables/useShareLinks'
import { isUnsupportedEndpoint } from '@/composables/aruna/connectors'
import { listShares, revokeShare, type ShareInfo } from '@/lib/api'
import { KIND_LABELS, MODE_LABELS, STATUS_LABELS, targetPath } from '@/lib/shareLinks'
import { copyToClipboard, formatDateTime } from '@/lib/utils'

const props = withDefaults(defineProps<{ refreshRevision?: number }>(), { refreshRevision: 0 })

const { currentUser, nodeInfo, realmInfo } = useAruna()

interface Row {
  share: ShareInfo
  /** null is the connected node. */
  nodeId: string | null
}

const rows = ref<Row[]>([])
const loading = ref(false)
const silentNodes = ref(0)
const error = ref<string | null>(null)
const page = ref(1)
const pageSize = ref(10)
const busy = ref<string | null>(null)
const logRow = ref<Row | null>(null)
const logOpen = ref(false)

/** The connected node and every other realm node that publishes an API address. */
function nodesToAsk(): (string | null)[] {
  const local = nodeInfo.value?.node.peer_id
  const others = (realmInfo.value?.nodes ?? [])
    .filter((node) => node.node_id !== local && node.kind !== 'user' && nodeApiBase(node))
    .map((node) => node.node_id)
  return [null, ...others]
}

let generation = 0
async function load() {
  const run = ++generation
  loading.value = true
  error.value = null
  const answers = await Promise.allSettled(
    nodesToAsk().map(async (nodeId) => (await listShares(await shareClient(nodeId))).map((share) => ({ share, nodeId }))),
  )
  if (run !== generation) return
  const found = answers.flatMap((answer) => (answer.status === 'fulfilled' ? answer.value : []))
  const failed = answers.filter((answer) => answer.status === 'rejected' && !isUnsupportedEndpoint(answer.reason))
  silentNodes.value = failed.length
  if (failed.length === answers.length && !found.length) error.value = shareErrorMessage((failed[0] as PromiseRejectedResult).reason)
  rows.value = found.sort((a, b) => b.share.created_at.localeCompare(a.share.created_at))
  page.value = 1
  loading.value = false
}

// The realm's node list may arrive after the tab opens; its nodes are asked then.
watch([currentUser, () => nodesToAsk().join()], ([user]) => user && void load(), { immediate: true })
watch(() => props.refreshRevision, () => currentUser.value && void load())

const shown = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

async function copy(row: Row) {
  busy.value = row.share.id
  error.value = null
  try {
    await copyToClipboard(await linkFor(row.share.id, row.nodeId))
  } catch (cause) {
    error.value = shareErrorMessage(cause)
  } finally {
    busy.value = null
  }
}

async function revoke(row: Row) {
  busy.value = row.share.id
  error.value = null
  try {
    await revokeShare(row.share.id, await shareClient(row.nodeId))
    const at = new Date().toISOString()
    rows.value = rows.value.map((entry) => (entry === row ? { ...entry, share: { ...entry.share, status: 'revoked', revoked_at: at } } : entry))
  } catch (cause) {
    error.value = shareErrorMessage(cause)
  } finally {
    busy.value = null
  }
}

function openLog(row: Row) {
  logRow.value = row
  logOpen.value = true
}
</script>

<template>
  <section aria-labelledby="shared-links-heading">
    <SectionHeading id="shared-links-heading" title="Shared links" :icon="Link2" :level="3" info="Links that open your data without an account. Create them from Share on a file, folder, bucket or dataset." />
    <div class="surface overflow-hidden">
      <p v-if="!currentUser" class="px-5 py-6 text-xs text-muted-foreground">Sign in to see your shared links.</p>
      <template v-else>
        <RefusalNote v-if="error" :message="error" class="mx-5 mt-4" />
        <Notice v-if="silentNodes && !error" tone="warning" class="mx-5 mt-4">
          {{ silentNodes === 1 ? '1 node did not answer, so its links are' : `${silentNodes} nodes did not answer, so their links are` }} missing here.
        </Notice>
        <div class="min-w-0 overflow-x-auto">
          <table class="data-table min-w-max">
            <thead>
              <tr>
                <th class="px-5 py-2 text-left font-semibold">Item</th>
                <th class="px-5 py-2 text-left font-semibold">Access</th>
                <th class="px-5 py-2 text-left font-semibold">Expires</th>
                <th class="px-5 py-2 text-left font-semibold">Created</th>
                <th class="px-5 py-2 text-left font-semibold">Password</th>
                <th class="px-5 py-2 text-right font-semibold">Downloads</th>
                <th class="px-5 py-2 text-right font-semibold">Uploads</th>
                <th class="px-5 py-2 text-left font-semibold">Last used</th>
                <th class="px-5 py-2 text-left font-semibold">Status</th>
                <th class="px-5 py-2"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in shown" :key="`${row.nodeId}/${row.share.id}`" class="border-t border-border text-xs">
                <td class="max-w-[22rem] px-5 py-2.5">
                  <button type="button" class="block max-w-full truncate text-left text-primary hover:underline" :title="`${targetPath(row.share.target)}, open the access log`" @click="openLog(row)">
                    {{ targetPath(row.share.target) }}
                  </button>
                  <span class="block text-muted-foreground">{{ KIND_LABELS[row.share.target.kind] }}<template v-if="row.share.label">, {{ row.share.label }}</template></span>
                </td>
                <td class="px-5 py-2.5 text-foreground">{{ MODE_LABELS[row.share.mode] }}</td>
                <td class="whitespace-nowrap px-5 py-2.5 text-muted-foreground">{{ row.share.expires_at ? formatDateTime(row.share.expires_at) : 'No expiry' }}</td>
                <td class="whitespace-nowrap px-5 py-2.5 text-muted-foreground">{{ formatDateTime(row.share.created_at) }}</td>
                <td class="px-5 py-2.5 text-muted-foreground">{{ row.share.password ? 'Yes' : 'No' }}</td>
                <td class="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{{ row.share.downloads.toLocaleString('en-US') }}</td>
                <td class="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{{ row.share.uploads.toLocaleString('en-US') }}</td>
                <td class="whitespace-nowrap px-5 py-2.5 text-muted-foreground">{{ row.share.last_access_at ? formatDateTime(row.share.last_access_at) : 'Never' }}</td>
                <td class="px-5 py-2.5 text-muted-foreground">{{ STATUS_LABELS[row.share.status] }}</td>
                <td class="whitespace-nowrap px-5 py-2.5 text-right">
                  <Button v-if="row.share.status === 'active'" variant="outline" size="icon-sm" :disabled="busy === row.share.id" aria-label="Copy link" title="Copy link" @click="copy(row)">
                    <Copy class="h-3.5 w-3.5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button variant="outline" size="icon-sm" class="ml-1" :aria-label="`Actions for ${targetPath(row.share.target)}`" :title="`Actions for ${targetPath(row.share.target)}`">
                        <Ellipsis class="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @click="openLog(row)">Access log</DropdownMenuItem>
                      <DropdownMenuItem v-if="row.share.status === 'active'" class="text-destructive focus:text-destructive" :disabled="busy === row.share.id" @click="revoke(row)">Revoke</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
              <tr v-if="!rows.length">
                <td colspan="10" class="px-5 py-6 text-center text-xs text-muted-foreground">
                  {{ loading ? 'Loading shared links…' : 'No shared links yet' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ListPager v-if="rows.length > 10" v-model:page="page" v-model:page-size="pageSize" :total="rows.length" class="border-t border-border" />
      </template>
    </div>
    <ShareLogDialog v-model:open="logOpen" :share="logRow?.share ?? null" :node-id="logRow?.nodeId ?? null" />
  </section>
</template>
