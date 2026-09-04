// The figures an HTML report carries inline, so a plot inside a report can be
// shown on its own instead of the markup being pasted into the chat. Only
// images the file itself holds are read; nothing is fetched.

export interface HtmlFigure {
  /** The section the image sits under, as its heading reads. */
  section: string
  /** The image's own alt text, where it has one. */
  alt: string
  /** The inline image, always a data: URI. */
  url: string
  contentType: string
  bytes: number
}

/** Below this an inline image is a status icon or a spacer, not a figure. */
const MIN_FIGURE_BYTES = 1_000
const MAX_FIGURES = 60
const HEADING_OR_IMAGE = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>|<img\b([^>]*)>/gi
const ATTRIBUTE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
const TAGS = /<[^>]*>/g
const STATUS = /^\s*\[[^\]]{1,12}\]\s*/

function plain(html: string): string {
  return html.replace(TAGS, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim().replace(STATUS, '')
}

function attributes(source: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const match of source.matchAll(ATTRIBUTE)) {
    found[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return found
}

/** The bytes a data: URI stands for, near enough to rank figures by size. */
function dataBytes(url: string): number {
  const comma = url.indexOf(',')
  if (comma < 0) return 0
  const payload = url.length - comma - 1
  return url.slice(0, comma).includes('base64') ? Math.floor(payload * 0.75) : payload
}

export function htmlFigures(source: string): HtmlFigure[] {
  const figures: HtmlFigure[] = []
  let section = ''
  for (const match of source.matchAll(HEADING_OR_IMAGE)) {
    if (match[2] !== undefined) {
      section = plain(match[2])
      continue
    }
    const attrs = attributes(match[3] ?? '')
    const url = attrs.src ?? ''
    if (!url.toLowerCase().startsWith('data:image/')) continue
    const bytes = dataBytes(url)
    if (bytes < MIN_FIGURE_BYTES) continue
    figures.push({
      section,
      alt: attrs.alt ?? '',
      url,
      contentType: url.slice(5, url.indexOf(';') > 0 ? url.indexOf(';') : url.indexOf(',')) || 'image/png',
      bytes,
    })
    if (figures.length >= MAX_FIGURES) break
  }
  return figures
}

/** What to call a figure in a list or on a card. */
export function figureName(figure: HtmlFigure): string {
  return figure.section || figure.alt || 'Figure'
}

function words(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

/** The figure whose section or alt text answers the asked-for name, if any. */
export function pickFigure(figures: HtmlFigure[], wanted: string): HtmlFigure | null {
  const needle = words(wanted)
  if (!needle.length) return null
  let best: { figure: HtmlFigure; score: number } | null = null
  for (const figure of figures) {
    const haystack = words(`${figure.section} ${figure.alt}`)
    const score = needle.filter((word) => haystack.includes(word)).length
    if (!score) continue
    if (!best || score > best.score || (score === best.score && figure.bytes > best.figure.bytes)) {
      best = { figure, score }
    }
  }
  // Every asked-for word, or a clear majority of them: one shared word such as
  // "content" must never pass for a different figure.
  if (!best) return null
  const enough = best.score === needle.length || (best.score >= 2 && best.score * 2 > needle.length)
  return enough ? best.figure : null
}
