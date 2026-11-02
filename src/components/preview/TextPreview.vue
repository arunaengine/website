<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { EDITOR_FONT, highlightExtension } from '@/lib/codemirror'
import { languageExtension } from '@/lib/codeLanguage'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{ text: string; language?: string }>()

const host = ref<HTMLElement | null>(null)
let view: EditorView | null = null

const { isDark } = useTheme()

const baseTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', fontSize: '12.5px', maxHeight: '72vh' },
  '.cm-scroller': { fontFamily: EDITOR_FONT, lineHeight: '1.55' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', opacity: '0.6' },
  '.cm-activeLineGutter, .cm-activeLine': { backgroundColor: 'transparent' },
})

async function build() {
  const language = await languageExtension(props.language)
  if (!host.value) return
  view?.destroy()
  const extensions: Extension[] = [
    lineNumbers(),
    EditorView.lineWrapping,
    highlightExtension(isDark.value),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    baseTheme,
  ]
  if (language) extensions.push(language)
  view = new EditorView({ parent: host.value, doc: props.text, extensions })
}

watch(
  () => [props.text, props.language, isDark.value],
  () => void build(),
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})
</script>

<template>
  <div ref="host" class="overflow-hidden rounded-md border border-border bg-muted/20" />
</template>
