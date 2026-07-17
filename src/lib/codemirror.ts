import type { Extension } from '@codemirror/state'
import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

// Token palette for the brand-default dark surface; the light theme keeps
// CodeMirror's dark-on-light default style. Shared by every editor chunk so
// script editing and file previews highlight identically.
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

export function highlightExtension(dark: boolean): Extension {
  return syntaxHighlighting(dark ? darkHighlight : defaultHighlightStyle, { fallback: true })
}

// The app's font-mono stack (tailwind.config.js) for editor scrollers. Set on
// .cm-scroller so gutters and content share one typography — a proportional
// gutter font skews the line numbers against the code lines.
export const EDITOR_FONT = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
