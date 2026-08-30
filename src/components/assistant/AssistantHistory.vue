<script setup lang="ts">
// Browser-local conversation switcher. The composable owns persistence and
// turn cancellation; this component only presents the named chat records.
import { ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { Check, Pencil, Trash2, X } from '@lucide/vue'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const { chats, activeChatId, historyReady, selectChat, deleteChat, renameChat } = useAssistantChat()
const editingId = ref<string | null>(null)
const draftTitle = ref('')

function beginRename(id: string, title: string) {
  editingId.value = id
  draftTitle.value = title
}

function commitRename() {
  if (!editingId.value) return
  renameChat(editingId.value, draftTitle.value)
  editingId.value = null
}

function cancelRename() {
  editingId.value = null
  draftTitle.value = ''
}
</script>

<template>
  <section
    aria-label="Assistant chats"
    class="border-b border-border bg-background/30 px-3 py-2"
    :class="compact ? 'text-[11px]' : 'text-xs'"
  >
    <div class="mb-1 flex items-center justify-between gap-2">
      <span class="font-medium text-muted-foreground">Chats</span>
      <span v-if="historyReady" class="text-[10px] text-muted-foreground">{{ chats.length }}</span>
      <span v-else class="text-[10px] text-muted-foreground">Loading…</span>
    </div>

    <div v-if="historyReady" class="scrollbar-thin max-h-28 space-y-0.5 overflow-y-auto">
      <div v-for="chat in chats" :key="chat.id" class="group flex min-w-0 items-center gap-1 rounded-md">
        <Input
          v-if="editingId === chat.id"
          v-model="draftTitle"
          class="h-7 min-w-0 flex-1 px-2 text-xs"
          aria-label="Chat name"
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent="cancelRename"
        />
        <button
          v-else
          type="button"
          class="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :class="activeChatId === chat.id ? 'bg-muted font-medium' : ''"
          :aria-current="activeChatId === chat.id ? 'page' : undefined"
          @click="selectChat(chat.id)"
          @dblclick="beginRename(chat.id, chat.title)"
        >{{ chat.title }}</button>
        <Button
          v-if="editingId === chat.id"
          variant="ghost"
          size="icon-sm"
          class="shrink-0"
          aria-label="Save chat name"
          title="Save chat name"
          @click="commitRename"
        ><Check class="size-3.5" /></Button>
        <Button
          v-if="editingId === chat.id"
          variant="ghost"
          size="icon-sm"
          class="shrink-0"
          aria-label="Cancel renaming chat"
          title="Cancel"
          @click="cancelRename"
        ><X class="size-3.5" /></Button>
        <template v-else>
          <Button
            variant="ghost"
            size="icon-sm"
            class="shrink-0 opacity-60 group-hover:opacity-100"
            :aria-label="`Rename ${chat.title}`"
            :title="`Rename ${chat.title}`"
            @click="beginRename(chat.id, chat.title)"
          ><Pencil class="size-3.5" /></Button>
          <Button
            variant="ghost"
            size="icon-sm"
            class="shrink-0 text-destructive opacity-60 group-hover:opacity-100"
            :aria-label="`Delete ${chat.title}`"
            :title="`Delete ${chat.title}`"
            @click="deleteChat(chat.id)"
          ><Trash2 class="size-3.5" /></Button>
        </template>
      </div>
    </div>
  </section>
</template>
