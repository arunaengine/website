<script setup lang="ts">
// The message box: one rounded card holding the text area, the cogwheel and
// Send. Enter sends, Shift+Enter breaks the line, and the turn's context
// (route, open draft, realm profiles) is gathered here.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useRealmBucketCount } from '@/composables/useBucketCount'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import Textarea from '@/components/ui/Textarea.vue'
import AssistantSettings from '@/components/assistant/AssistantSettings.vue'
import VaultUnlockForm from '@/components/settings/VaultUnlockForm.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealm } from '@/composables/useRealm'
import { activeGroupId } from '@/composables/useGroupSelection'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { useAssistantEditor } from '@/composables/useAssistantEditor'
import { useAssistantProfileForm } from '@/composables/useAssistantProfileForm'
import { useAssistantRunForm } from '@/composables/useAssistantRunForm'
import { usePageContext } from '@/composables/usePageContext'
import { useUserVault } from '@/composables/useUserVault'
import { useAssistantProviders } from '@/composables/useAssistantProviders'
import { CENTRAL_PROVIDER_ID } from '@/lib/api'
import { Gauge, SendHorizontal, Settings2 } from '@lucide/vue'

/** About eight rows; the card scrolls inside itself beyond that. */
const MAX_HEIGHT = 200

const props = withDefaults(
  defineProps<{
    size?: 'compact' | 'full'
    /** Set in the floating panel, so the settings popover opens above it. */
    raised?: boolean
  }>(),
  { size: 'compact', raised: false },
)

const route = useRoute()
const { currentUser, profiles, myGroups, discoverableGroups, realmInfo, usageInfo } = useAruna()
const realmBuckets = useRealmBucketCount(computed(() => usageInfo.value?.realm))
const { realmId } = useRealm()
const { bridge } = useAssistantEditor()
const { bridge: runForm } = useAssistantRunForm()
const { bridge: profileForm } = useAssistantProfileForm()
const { currentPage } = usePageContext()
const {
  busy,
  draft,
  toolsNote,
  provider,
  providerId,
  model,
  historyReady,
  loadModels,
  send,
  removed,
  switchNotice,
  confirmSwitch,
  keepCurrent,
} = useAssistantChat()
const { state: vaultState } = useUserVault()

const box = ref<{ $el: HTMLTextAreaElement } | null>(null)
const unlockOpen = ref(false)
// The chosen provider is one sealed on the node when nothing is ready, or when
// the choice names a provider the ready list does not hold.
const keysLocked = computed(() =>
  vaultState.value === 'locked'
  && (!provider.value || (providerId.value !== '' && providerId.value !== provider.value.provider_id)))
const { central, centralUnavailable, refreshCentral } = useAssistantProviders()
// Today's realm assistant calls, while it is the chosen provider and has a limit.
const quota = computed(() => {
  const setup = central.value
  if (provider.value?.provider_id !== CENTRAL_PROVIDER_ID || setup?.daily_limit == null) return null
  const reset = new Date(setup.resets_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return { left: Math.max(setup.daily_limit - setup.used_today, 0), limit: setup.daily_limit, reset }
})
// A used-up day ends at the reset; a server clock still before it is asked again a minute later.
let resetTimer: ReturnType<typeof setTimeout> | undefined
watch(quota, (next) => {
  clearTimeout(resetTimer)
  resetTimer = undefined
  if (next?.left !== 0 || !central.value) return
  const wait = Date.parse(central.value.resets_at) - Date.now()
  resetTimer = setTimeout(() => void refreshCentral(), wait > 0 ? wait + 1_000 : 60_000)
}, { immediate: true })

// A window coming back may have missed the reset or the end of an outage.
function onActive() {
  if (document.visibilityState === 'hidden') return
  if (quota.value || centralUnavailable.value) void refreshCentral()
}
onMounted(() => {
  if (typeof window === 'undefined') return
  window.addEventListener('focus', onActive)
  document.addEventListener('visibilitychange', onActive)
})
onUnmounted(() => {
  clearTimeout(resetTimer)
  if (typeof window === 'undefined') return
  window.removeEventListener('focus', onActive)
  document.removeEventListener('visibilitychange', onActive)
})

const canSend = computed(() =>
  historyReady.value && !busy.value && Boolean(provider.value) && Boolean(model.value) && Boolean(draft.value.trim())
  && quota.value?.left !== 0)

function resize() {
  const field = box.value?.$el
  if (!field?.style) return
  field.style.height = 'auto'
  field.style.height = `${Math.min(field.scrollHeight, MAX_HEIGHT)}px`
}

watch(draft, resize, { flush: 'post' })
onMounted(resize)

// The dashboard's realm figures, so simple count questions need no tool call.
function realmSummary() {
  if (!currentUser.value) return undefined
  const infra = (realmInfo.value?.nodes ?? []).filter((node) => node.kind !== 'user')
  const online = infra.filter((node) => node.present).length
  const usage = usageInfo.value
  return {
    datasets: usage?.metadata_documents ?? undefined,
    profiles: profiles.value.length,
    groups: myGroups.value.length + discoverableGroups.value.length,
    nodesOnline: infra.length ? `${online} / ${infra.length}` : undefined,
    // The flat usage fields are this node's own; the realm figures are summed over all nodes.
    objects: usage?.realm?.objects,
    buckets: realmBuckets.value?.count,
    bucketsExact: realmBuckets.value?.exact,
    storedBytes: usage?.realm?.stored_bytes ?? undefined,
  }
}

// The signed-in user and active group, so the model reuses these ids directly.
function identity() {
  const user = currentUser.value
  if (!user) return undefined
  const group = activeGroupId.value
  return {
    userId: user.id,
    realmId: realmId.value || undefined,
    groupId: group || undefined,
    groupName: group ? myGroups.value.find((entry) => entry.id === group)?.name : undefined,
  }
}

// What the open profile builder is showing, so its tools have their subject.
function profileFormContext() {
  const form = profileForm.value?.summary()
  if (!form) return null
  return {
    name: form.name,
    group: form.group,
    entities: form.entities.length,
    rules: form.entities.reduce((total, entity) => total + entity.properties.length, 0),
    problems: form.problems.length,
  }
}

// What the open run page is showing, so the run tools have their subject.
function runFormContext() {
  const form = runForm.value?.summary()
  if (!form) return null
  return {
    name: form.name,
    executor: form.executor.runtime ? `the ${form.executor.runtime} runtime` : form.executor.image || 'a custom image',
    inputs: form.inputs.length,
    outputs: form.outputs.length,
    problems: form.problems.length,
  }
}

function submit() {
  if (!canSend.value) return
  const text = draft.value
  draft.value = ''
  void send(text, {
    route: route.fullPath,
    page: currentPage(),
    draft: bridge.value?.summary() ?? null,
    runForm: runFormContext(),
    profileForm: profileFormContext(),
    profiles: profiles.value.map((profile) => ({ id: profile.id, name: profile.name })),
    realm: realmSummary(),
    identity: identity(),
  })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  submit()
}
</script>

<template>
  <div class="space-y-2">
    <Notice v-if="toolsNote" tone="info">{{ toolsNote }}</Notice>
    <Notice v-if="keysLocked" tone="warning" class="flex items-center justify-between gap-3">
      <span>
        Your provider keys are locked.
        <RouterLink :to="{ name: 'settings', query: { tab: 'keys' } }" class="text-primary hover:underline">
          Manage them in Settings, Vault.
        </RouterLink>
      </span>
      <Button variant="outline" size="sm" @click="unlockOpen = true">Unlock</Button>
    </Notice>
    <Notice v-if="removed" tone="warning" class="flex items-center justify-between gap-3">
      <span>The provider {{ removed.label }} was removed. Pick a provider to continue.</span>
      <AssistantSettings>
        <Button variant="outline" size="sm" @click="loadModels">Pick a provider</Button>
      </AssistantSettings>
    </Notice>
    <Notice v-if="centralUnavailable && !provider" tone="warning">
      The realm assistant cannot be reached right now. Try again later or pick your own provider.
    </Notice>
    <Notice v-if="switchNotice" tone="info" class="flex flex-wrap items-center justify-between gap-3">
      <span>
        Switching to {{ switchNotice.model }}: the new model reads the whole chat again
        ({{ switchNotice.messages }} {{ switchNotice.messages === 1 ? 'message' : 'messages' }},
        about {{ switchNotice.kiloChars }} thousand characters)
      </span>
      <span class="flex shrink-0 gap-2">
        <Button size="sm" @click="confirmSwitch">Switch</Button>
        <Button variant="outline" size="sm" @click="keepCurrent">Keep current</Button>
      </span>
    </Notice>
    <div class="rounded-2xl border border-border bg-card shadow-sm focus-within:border-ring">
      <Textarea
        ref="box"
        v-model="draft"
        rows="1"
        class="max-h-[12.5rem] min-h-0 resize-none border-0 bg-transparent px-3.5 py-3 font-sans shadow-none focus-visible:border-0 focus-visible:ring-0"
        :class="props.size === 'full' ? 'text-sm' : 'text-xs'"
        :placeholder="quota?.left === 0 ? `The realm assistant is back at ${quota.reset}` : 'Ask the assistant'"
        aria-label="Message"
        @keydown="onKeydown"
      />
      <div class="flex items-center justify-end gap-1 px-2 pb-2">
        <AssistantSettings :raised="props.raised">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Chat settings"
            title="Chat settings"
            @click="loadModels"
          >
            <Settings2 class="size-4" />
          </Button>
        </AssistantSettings>
        <Button size="icon-sm" aria-label="Send" title="Send" :disabled="!canSend" @click="submit">
          <SendHorizontal class="size-4" />
        </Button>
      </div>
    </div>
    <p
      v-if="props.size === 'full' || quota"
      class="flex items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground"
    >
      <span v-if="props.size === 'full'">Enter sends, Shift+Enter starts a new line.</span>
      <span
        v-if="quota"
        class="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums"
        :class="quota.left === 0 ? 'text-status-warn' : ''"
      >
        <Gauge class="size-3.5" aria-hidden="true" />{{ quota.left }} of {{ quota.limit }} left today
      </span>
    </p>
    <Dialog :open="unlockOpen" @update:open="(open: boolean) => (unlockOpen = open)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Unlock your provider keys</DialogTitle>
          <DialogDescription>The keys on this node open with the passphrase you chose in settings.</DialogDescription>
        </DialogHeader>
        <VaultUnlockForm @done="unlockOpen = false" />
      </DialogContent>
    </Dialog>
  </div>
</template>
