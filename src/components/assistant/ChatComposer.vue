<script setup lang="ts">
// The message box: Enter sends, Shift+Enter breaks the line. It gathers the
// context a turn needs (route, open draft, realm profiles) itself.
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { useAruna } from '@/composables/useAruna'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { useAssistantEditor } from '@/composables/useAssistantEditor'

withDefaults(defineProps<{ size?: 'compact' | 'full' }>(), { size: 'compact' })

const route = useRoute()
const { profiles } = useAruna()
const { bridge } = useAssistantEditor()
const { busy, error, toolsNote, provider, model, historyReady, send } = useAssistantChat()

const input = ref('')

function submit() {
  if (!historyReady.value || busy.value || !provider.value || !model.value || !input.value.trim()) return
  const text = input.value
  input.value = ''
  void send(text, {
    route: route.fullPath,
    draft: bridge.value?.summary() ?? null,
    profiles: profiles.value.map((profile) => ({ id: profile.id, name: profile.name })),
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
    <Notice v-if="error" tone="error">{{ error }}</Notice>
    <div class="flex items-end gap-2">
      <Textarea
        v-model="input"
        :rows="size === 'full' ? 3 : 2"
        class="min-h-0 flex-1 font-sans"
        :class="size === 'full' ? 'text-sm' : 'text-xs'"
        placeholder="Ask the assistant"
        aria-label="Message"
        @keydown="onKeydown"
      />
      <Button :size="size === 'full' ? 'default' : 'sm'" :disabled="busy || !historyReady || !input.trim() || !provider || !model" @click="submit">
        Send
      </Button>
    </div>
  </div>
</template>
