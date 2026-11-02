// How much of a text a chat card shows before it offers the rest.

/** How many lines a card shows before it offers more. */
export const PREVIEW_LINES = 40

const MAX_CHARS = 6_000

/** The first lines of a text, and whether anything was left out. */
export function firstLines(text: string, lines = PREVIEW_LINES): { text: string; cut: boolean } {
  const all = text.split('\n')
  let shown = all.length > lines ? all.slice(0, lines).join('\n') : text
  if (shown.length > MAX_CHARS) shown = shown.slice(0, MAX_CHARS)
  return { text: shown, cut: shown.length < text.length }
}
