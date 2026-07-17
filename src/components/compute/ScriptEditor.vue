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
import { bracketMatching, defaultHighlightStyle, HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { tags as t } from '@lezer/highlight'
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

// Token palette for the brand-default dark surface; the light theme keeps
// CodeMirror's dark-on-light default style.
const darkHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword, t.moduleKeyword], color: '#c678dd' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#98c379' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#7d8799', fontStyle: 'italic' },
  { tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom], color: '#d19a66' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#61afef' },
  { tag: [t.definition(t.variableName), t.typeName, t.className, t.namespace], color: '#e5c07b' },
  { tag: [t.propertyName, t.attributeName], color: '#e06c75' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: '#abb2bf' },
  { tag: t.invalid, color: '#e06c75' },
])

function highlightExtension(dark: boolean): Extension {
  return syntaxHighlighting(dark ? darkHighlight : defaultHighlightStyle, { fallback: true })
}

const theme = EditorView.theme({
  '&': { fontSize: '12.5px', backgroundColor: 'transparent', color: 'hsl(var(--foreground))' },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    padding: '10px 0',
    caretColor: 'hsl(var(--foreground))',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'hsl(var(--foreground))' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'hsl(var(--muted-foreground))' },
  '.cm-activeLine': { backgroundColor: 'hsl(var(--muted) / 0.5)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'hsl(var(--foreground))' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'hsl(var(--accent))' },
  '.cm-scroller': { fontFamily: 'inherit', maxHeight: '360px', overflow: 'auto', lineHeight: '1.5' },
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
  <div ref="host" class="overflow-hidden rounded-md border border-border bg-muted/20" />
</template>
