<script setup lang="ts">
// The message box: one rounded card holding the text area, the cogwheel and
// Send. Enter sends, Shift+Enter breaks the line, and the turn's context
// (route, open draft, realm profiles) is gathered here.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
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
import { SendHorizontal, Settings2 } from '@lucide/vue'

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
const canSend = computed(() =>
  historyReady.value && !busy.value && Boolean(provider.value) && Boolean(model.value) && Boolean(draft.value.trim()))

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
    objects: usage?.objects,
    buckets: usage?.buckets,
    storedBytes: usage?.stored_bytes ?? undefined,
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
          Manage them under Provider keys.
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
        placeholder="Ask the assistant"
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
    <p v-if="props.size === 'full'" class="px-1 text-[11px] text-muted-foreground">
      Enter sends, Shift+Enter starts a new line.
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
