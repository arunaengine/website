<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { EDITOR_FONT, highlightExtension } from '@/lib/codemirror'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{ text: string; language?: string }>()

const host = ref<HTMLElement | null>(null)
let view: EditorView | null = null

// Each syntax package loads in its own dynamic chunk, fetched only when a file
// of that language is previewed; unknown languages render as plain text.
async function languageExtension(language?: string): Promise<Extension | null> {
  switch (language) {
    case 'json':
      return (await import('@codemirror/lang-json')).json()
    case 'javascript':
      return (await import('@codemirror/lang-javascript')).javascript()
    case 'jsx':
      return (await import('@codemirror/lang-javascript')).javascript({ jsx: true })
    case 'typescript':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true })
    case 'tsx':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true })
    case 'python':
      return (await import('@codemirror/lang-python')).python()
    case 'rust':
      return (await import('@codemirror/lang-rust')).rust()
    case 'yaml':
      return (await import('@codemirror/lang-yaml')).yaml()
    case 'sql':
      return (await import('@codemirror/lang-sql')).sql()
    case 'css':
      return (await import('@codemirror/lang-css')).css()
    case 'xml':
      return (await import('@codemirror/lang-xml')).xml()
    case 'shell': {
      const { StreamLanguage } = await import('@codemirror/language')
      const { shell } = await import('@codemirror/legacy-modes/mode/shell')
      return StreamLanguage.define(shell)
    }
    case 'toml': {
      const { StreamLanguage } = await import('@codemirror/language')
      const { toml } = await import('@codemirror/legacy-modes/mode/toml')
      return StreamLanguage.define(toml)
    }
    case 'properties': {
      const { StreamLanguage } = await import('@codemirror/language')
      const { properties } = await import('@codemirror/legacy-modes/mode/properties')
      return StreamLanguage.define(properties)
    }
    case 'c':
    case 'cpp':
    case 'java':
    case 'csharp':
    case 'kotlin': {
      const { StreamLanguage } = await import('@codemirror/language')
      const clike = await import('@codemirror/legacy-modes/mode/clike')
      return StreamLanguage.define(clike[language])
    }
    case 'go': {
      const { StreamLanguage } = await import('@codemirror/language')
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/go')).go)
    }
    case 'ruby': {
      const { StreamLanguage } = await import('@codemirror/language')
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/ruby')).ruby)
    }
    case 'swift': {
      const { StreamLanguage } = await import('@codemirror/language')
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/swift')).swift)
    }
    case 'r': {
      const { StreamLanguage } = await import('@codemirror/language')
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/r')).r)
    }
    case 'dockerfile': {
      const { StreamLanguage } = await import('@codemirror/language')
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile)
    }
    case 'diff': {
      const { StreamLanguage } = await import('@codemirror/language')
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/diff')).diff)
    }
    default:
      return null
  }
}

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
