<script setup lang="ts">
// Browser-local conversation switcher. The composable owns persistence and
// turn cancellation; this component only presents the named chat records.
import { ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Input from '@/components/ui/Input.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { relativeTime } from '@/lib/utils'
import { Check, Pencil, Trash2, X } from '@lucide/vue'

const props = withDefaults(defineProps<{ compact?: boolean; readOnly?: boolean }>(), {
  compact: false,
  readOnly: false,
})

const { chats, activeChatId, historyReady, selectChat, deleteChat, renameChat } = useAssistantChat()
const editingId = ref<string | null>(null)
const draftTitle = ref('')

function beginRename(id: string, title: string) {
  if (props.readOnly) return
  editingId.value = id
  draftTitle.value = title
}

function commitRename() {
  if (props.readOnly || !editingId.value) return
  renameChat(editingId.value, draftTitle.value)
  editingId.value = null
}

function cancelRename() {
  editingId.value = null
  draftTitle.value = ''
}

function when(updatedAt: number): string {
  return relativeTime(new Date(updatedAt).toISOString())
}
</script>

<template>
  <section
    aria-label="Assistant chats"
    class="flex min-h-0 flex-col"
    :class="props.compact ? 'max-h-32 border-b border-border bg-background/30' : 'overflow-hidden'"
  >
    <div class="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
      <span class="text-xs font-medium text-muted-foreground">Chats</span>
      <span v-if="historyReady" class="text-[11px] tabular-nums text-muted-foreground">{{ chats.length }}</span>
      <Spinner v-else />
    </div>

    <EmptyState
      v-if="historyReady && !chats.length"
      compact
      title="No chats yet."
      description="A new conversation appears here once you send the first message."
      class="m-3 shrink-0"
    />

    <ul v-else-if="historyReady" class="scrollbar-thin min-h-0 flex-1 divide-y divide-border overflow-y-auto">
      <li
        v-for="chat in chats"
        :key="chat.id"
        class="group flex min-w-0 items-center gap-1 px-2"
        :class="activeChatId === chat.id ? 'bg-muted/60' : 'hover:bg-muted/30'"
      >
        <template v-if="editingId === chat.id && !props.readOnly">
          <Input
            v-model="draftTitle"
            class="my-1 h-7 min-w-0 flex-1 px-2 text-xs"
            aria-label="Chat name"
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="cancelRename"
          />
          <Button variant="ghost" size="icon-sm" class="shrink-0" aria-label="Save chat name" @click="commitRename">
            <Check class="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" class="shrink-0" aria-label="Cancel renaming chat" @click="cancelRename">
            <X class="size-3.5" />
          </Button>
        </template>

        <template v-else>
          <button
            type="button"
            class="min-w-0 flex-1 rounded-md px-1 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-current="activeChatId === chat.id ? 'page' : undefined"
            @click="selectChat(chat.id)"
            @dblclick="beginRename(chat.id, chat.title)"
          >
            <span class="block truncate text-xs text-foreground" :class="activeChatId === chat.id ? 'font-medium' : ''">
              {{ chat.title }}
            </span>
            <span class="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {{ when(chat.updatedAt) }} · {{ chat.messages.length }} {{ chat.messages.length === 1 ? 'message' : 'messages' }}
            </span>
          </button>
          <template v-if="!props.readOnly">
            <Button
              variant="ghost"
              size="icon-sm"
              class="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
              :aria-label="`Rename ${chat.title}`"
              :title="`Rename ${chat.title}`"
              @click="beginRename(chat.id, chat.title)"
            ><Pencil class="size-3.5" /></Button>
            <Button
              variant="ghost"
              size="icon-sm"
              class="shrink-0 text-destructive opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
              :aria-label="`Delete ${chat.title}`"
              :title="`Delete ${chat.title}`"
              @click="deleteChat(chat.id)"
            ><Trash2 class="size-3.5" /></Button>
          </template>
        </template>
      </li>
    </ul>
  </section>
</template>
