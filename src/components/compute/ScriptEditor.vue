<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentUnit } from '@codemirror/language'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { EDITOR_FONT, highlightExtension } from '@/lib/codemirror'
import { useTheme } from '@/composables/useTheme'

// Lazy-loaded on its own chunk: the quick-run wizard mounts it through
// defineAsyncComponent so CodeMirror never enters the main bundle.
export type ScriptLang = 'python' | 'javascript' | 'text'

const props = withDefaults(defineProps<{ modelValue: string; language: ScriptLang; disabled?: boolean }>(), {
  disabled: false,
})
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const { isDark } = useTheme()
const host = useTemplateRef<HTMLDivElement>('host')
const view = shallowRef<EditorView | null>(null)
const languageConf = new Compartment()
const editableConf = new Compartment()
const highlightConf = new Compartment()

function langExtension(lang: ScriptLang): Extension {
  if (lang === 'python') return python()
  if (lang === 'javascript') return javascript()
  return []
}

// The mono stack lives on .cm-scroller so gutter and content share font,
// size and line-height — an inherited proportional font in the gutters made
// the line numbers misaligned and visually off.
const theme = EditorView.theme({
  '&': { fontSize: '12.5px', backgroundColor: 'transparent', color: 'hsl(var(--foreground))' },
  '.cm-scroller': {
    fontFamily: EDITOR_FONT,
    lineHeight: '1.6',
    minHeight: '10rem',
    maxHeight: '360px',
    overflow: 'auto',
  },
  '.cm-content': { padding: '10px 0', caretColor: 'hsl(var(--foreground))' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'hsl(var(--foreground))' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'hsl(var(--muted-foreground) / 0.8)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 10px 0 14px',
    minWidth: '36px',
    fontVariantNumeric: 'tabular-nums',
  },
  '.cm-activeLine': { backgroundColor: 'hsl(var(--muted) / 0.5)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'hsl(var(--foreground))' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'hsl(var(--accent))' },
  '&.cm-focused': { outline: 'none' },
})

onMounted(() => {
  if (!host.value) return
  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      lineNumbers(),
      highlightSpecialChars(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      drawSelection(),
      history(),
      bracketMatching(),
      indentUnit.of('  '),
      highlightConf.of(highlightExtension(isDark.value)),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      languageConf.of(langExtension(props.language)),
      editableConf.of(EditorView.editable.of(!props.disabled)),
      theme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
      }),
    ],
  })
  view.value = new EditorView({ state, parent: host.value })
})

onBeforeUnmount(() => {
  view.value?.destroy()
  view.value = null
})

// External model changes (e.g. loading a template) replace the whole document;
// skipped when the value already matches to avoid clobbering the cursor.
watch(
  () => props.modelValue,
  (value) => {
    const v = view.value
    if (!v || v.state.doc.toString() === value) return
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  },
)
watch(
  () => props.language,
  (lang) => view.value?.dispatch({ effects: languageConf.reconfigure(langExtension(lang)) }),
)
watch(
  () => props.disabled,
  (disabled) => view.value?.dispatch({ effects: editableConf.reconfigure(EditorView.editable.of(!disabled)) }),
)
watch(isDark, (dark) => view.value?.dispatch({ effects: highlightConf.reconfigure(highlightExtension(dark)) }))
</script>

<template>
  <div
    ref="host"
    class="overflow-hidden rounded-md border border-input bg-field shadow-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring"
  />
</template>
