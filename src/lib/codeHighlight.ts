// A chat code block highlighted as HTML spans with the editor's own token style,
// so a block in an answer reads like the same code in a file preview.
import { Language, LanguageSupport } from '@codemirror/language'
import { highlightCode } from '@lezer/highlight'
import { highlightStyle } from '@/lib/codemirror'
import { languageExtension } from '@/lib/codeLanguage'

const mounted = new Set<string>()

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// A style's class rules normally arrive with an editor; a bare block mounts them once.
function mountRules(rules: string) {
  if (!rules || mounted.has(rules) || typeof document === 'undefined') return
  mounted.add(rules)
  const element = document.createElement('style')
  element.textContent = rules
  document.head.append(element)
}

/** The block as highlighted HTML, or null when its language is unknown. */
export async function highlightHtml(code: string, language: string, dark: boolean): Promise<string | null> {
  const extension = await languageExtension(language)
  const parser = extension instanceof LanguageSupport
    ? extension.language.parser
    : extension instanceof Language ? extension.parser : null
  if (!parser) return null
  const style = highlightStyle(dark)
  mountRules(style.module?.getRules() ?? '')
  let html = ''
  highlightCode(
    code,
    parser.parse(code),
    style,
    (text, classes) => {
      html += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text)
    },
    () => {
      html += '\n'
    },
  )
  return html
}
