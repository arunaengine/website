<script setup lang="ts">
// The message box: one rounded card holding the text area, the cogwheel and
// Send. Enter sends, Shift+Enter breaks the line, and the turn's context
// (route, open draft, realm profiles) is gathered here.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Textarea from '@/components/ui/Textarea.vue'
import AssistantSettings from '@/components/assistant/AssistantSettings.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealm } from '@/composables/useRealm'
import { activeGroupId } from '@/composables/useGroupSelection'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { useAssistantEditor } from '@/composables/useAssistantEditor'
import { usePageContext } from '@/composables/usePageContext'
import { SendHorizontal, Settings2 } from '@lucide/vue'

/** About eight rows; the card scrolls inside itself beyond that. */
const MAX_HEIGHT = 200

const props = withDefaults(defineProps<{ size?: 'compact' | 'full' }>(), { size: 'compact' })

const route = useRoute()
const { currentUser, profiles, myGroups, discoverableGroups, realmInfo, usageInfo } = useAruna()
const { realmId } = useRealm()
const { bridge } = useAssistantEditor()
const { currentPage } = usePageContext()
const {
  busy,
  draft,
  toolsNote,
  provider,
  model,
  historyReady,
  loadModels,
  send,
} = useAssistantChat()

const box = ref<{ $el: HTMLTextAreaElement } | null>(null)
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

function submit() {
  if (!canSend.value) return
  const text = draft.value
  draft.value = ''
  void send(text, {
    route: route.fullPath,
    page: currentPage(),
    draft: bridge.value?.summary() ?? null,
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
        <AssistantSettings>
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
  </div>
</template>
