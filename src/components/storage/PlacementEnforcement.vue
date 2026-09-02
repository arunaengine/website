<script setup lang="ts">
// What this one node did with the copies it holds. A copy that no longer fits
// its rules is held back here; nothing is moved and nothing is deleted.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import StatCard from '@/components/ui/StatCard.vue'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { useRefresh } from '@/composables/useRefresh'
import { placementPoliciesErrorMessage } from '@/lib/placementPolicies'
import type {
  CopyViolationBody,
  DiagnosticsResponse,
  QuarantineResolveResponse,
} from '@/lib/placementPolicies'
import { formatNumber, truncateMiddle } from '@/lib/utils'
import { RotateCcw, ShieldAlert } from '@lucide/vue'

const props = defineProps<{ ready: boolean }>()

const { getPlacementDiagnostics, resolvePlacementQuarantine } = usePlacementPolicies()

const diagnostics = ref<DiagnosticsResponse | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const busy = ref(false)
const actionError = ref<string | null>(null)
const result = ref<QuarantineResolveResponse | null>(null)
const releaseTarget = ref<CopyViolationBody | null>(null)

async function load(cursor?: string) {
  loading.value = true
  loadError.value = null
  try {
    diagnostics.value = await getPlacementDiagnostics({ cursor, limit: 128 })
  } catch (error) {
    diagnostics.value = null
    loadError.value = placementPoliciesErrorMessage(error)
  } finally {
    loading.value = false
  }
}

const { busy: reloadBusy, refresh: onReload } = useRefresh(() => load())
const spinning = computed(() => reloadBusy.value || loading.value)

watch(() => props.ready, (ready) => { if (ready) void load() }, { immediate: true })

async function revalidateAll() {
  if (busy.value) return
  busy.value = true
  actionError.value = null
  result.value = null
  try {
    result.value = await resolvePlacementQuarantine({ action: 'revalidate' })
    await load()
  } catch (error) {
    actionError.value = placementPoliciesErrorMessage(error, 'quarantine')
  } finally {
    busy.value = false
  }
}

async function releaseCopy() {
  const target = releaseTarget.value
  if (!target || busy.value) return
  busy.value = true
  actionError.value = null
  result.value = null
  try {
    result.value = await resolvePlacementQuarantine({
      action: 'release',
      bucket: target.bucket,
      key: target.key,
      version_id: target.version_id,
    })
    releaseTarget.value = null
    await load()
  } catch (error) {
    actionError.value = placementPoliciesErrorMessage(error, 'quarantine')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="surface">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
      <div class="flex items-center gap-2">
        <ShieldAlert class="size-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Placement enforcement on this node</h2>
      </div>
      <div class="flex gap-2">
        <RefreshButton :busy="spinning" label="Reload" @click="onReload" />
        <Button size="sm" :disabled="busy" @click="revalidateAll">
          <RotateCcw class="size-3.5" /> {{ busy ? 'Checking again…' : 'Check every copy again' }}
        </Button>
      </div>
    </header>

    <div class="space-y-4 px-5 py-4">
      <p class="text-xs text-muted-foreground">
        A copy that no longer fits its rules is held back here, never moved or deleted.
        <DocsLink icon topic="where-data-lives" section="Placement policies" class="ml-0.5" />
      </p>

      <div v-if="loading && !diagnostics" class="space-y-2"><Skeleton class="h-16" /><Skeleton class="h-32" /></div>
      <ErrorPanel v-else-if="loadError" :message="loadError" @retry="() => load()" />
      <template v-else-if="diagnostics">
        <div class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
          <span class="font-medium text-foreground">This node reports</span>
          <span>location {{ diagnostics.subject_location ?? 'not published' }}</span>
          <Badge :variant="diagnostics.serving_blocked ? 'destructive' : 'success'" size="sm">
            {{ diagnostics.serving_blocked ? 'governed data is not served' : 'governed data is served' }}
          </Badge>
          <Badge v-if="diagnostics.policy_draining" variant="warn" size="sm">draining</Badge>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Copies looked at" :value="formatNumber(diagnostics.observed)" />
          <StatCard label="Stored here" :value="formatNumber(diagnostics.registered)" />
          <StatCard label="Held back" :value="formatNumber(diagnostics.quarantined)" />
          <StatCard label="Owner left the realm" :value="formatNumber(diagnostics.unresolved_departed)" />
        </div>

        <div v-if="diagnostics.violations.length" class="overflow-x-auto rounded-md border border-border">
          <table class="w-full min-w-[720px] text-left text-xs">
            <caption class="caption-top px-3 py-2 text-left text-[11px] text-muted-foreground">
              Copies this node holds back, with the exact version each belongs to.
            </caption>
            <thead class="border-y border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th class="px-3 py-2 font-medium">Bucket and key</th>
                <th class="px-3 py-2 font-medium">Version</th>
                <th class="px-3 py-2 font-medium">Why</th>
                <th class="px-3 py-2"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="violation in diagnostics.violations" :key="`${violation.bucket}:${violation.key}:${violation.version_id}`">
                <td class="px-3 py-2">
                  <div class="font-medium">{{ violation.bucket }}</div>
                  <div class="font-mono text-[11px] text-muted-foreground">{{ violation.key }}</div>
                </td>
                <td class="px-3 py-2 font-mono" :title="violation.version_id">{{ truncateMiddle(violation.version_id) }}</td>
                <td class="px-3 py-2">
                  <Badge :variant="violation.state === 'quarantined' ? 'destructive' : 'warn'" size="sm">
                    {{ violation.state === 'quarantined' ? 'no longer fits its rules' : 'owner left the realm' }}
                  </Badge>
                </td>
                <td class="px-3 py-2 text-right">
                  <Button variant="destructive" size="sm" :disabled="busy" @click="releaseTarget = violation">
                    Release
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <EmptyState v-else compact title="This node holds no copy back right now." />

        <div v-if="diagnostics.cursor" class="flex justify-end">
          <Button variant="outline" size="sm" :disabled="loading" :aria-busy="loading" @click="load(diagnostics.cursor)">
            <Spinner v-if="loading" label="Loading the next page" class="text-current" /> Next page
          </Button>
        </div>
      </template>

      <RefusalNote v-if="actionError" :message="actionError" />
      <p v-else-if="result" class="text-xs text-emerald-700 dark:text-emerald-300">
        {{ result.released ? 'Released the copy. ' : '' }}
        Looked at {{ result.scanned }}, restored {{ result.restored }}, held back {{ result.quarantined }}.
        {{ result.cleared ? 'This node serves governed data again.' : 'This node keeps holding data back.' }}
      </p>
    </div>

    <Dialog :open="releaseTarget !== null" @update:open="(value: boolean) => { if (!value && !busy) releaseTarget = null }">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Release this copy?</DialogTitle>
          <DialogDescription>
            This node stops holding the exact version below. If it was the last one held back,
            governed data is served again here.
          </DialogDescription>
        </DialogHeader>
        <div v-if="releaseTarget" class="rounded-md border border-border bg-muted/20 p-3 font-mono text-xs">
          <div>{{ releaseTarget.bucket }}</div>
          <div class="break-all">{{ releaseTarget.key }}</div>
          <div>{{ releaseTarget.version_id }}</div>
        </div>
        <RefusalNote v-if="actionError" :message="actionError" />
        <DialogFooter>
          <DialogClose as-child><Button variant="outline" :disabled="busy">Cancel</Button></DialogClose>
          <Button variant="destructive" :disabled="busy" @click="releaseCopy">
            {{ busy ? 'Releasing…' : 'Release this version' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
