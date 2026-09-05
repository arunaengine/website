// External links in an answer become numbered marks with one reference list
// per message, so a web-search answer does not repeat "(example.org)" after
// every sentence. Links into the portal are not citations and stay as they are.
import type { MarkdownIt, StateCore, Token } from 'markdown-it'

export interface MessageSource {
  url: string
  /** The page title the provider reported, when it did. */
  title?: string
}

export interface CitationEnv {
  /** Prefix of the anchor ids, unique per rendered message. */
  refId?: string
  sources?: MessageSource[]
}

function external(href: string): boolean {
  return /^https?:\/\//i.test(href)
}

/** One number per page: the fragment and a trailing slash do not make a new one. */
function sameUrl(url: string): string {
  return url.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase()
}

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** True when the link text adds nothing to the address: the URL, the domain, or the domain in parentheses. */
function bareText(text: string, href: string): boolean {
  const shown = text.trim().replace(/^\(+/, '').replace(/\)+$/, '').trim().toLowerCase().replace(/\/+$/, '')
  if (!shown) return true
  const host = domain(href).toLowerCase()
  const address = sameUrl(href)
  const forms = new Set([address, address.replace(/^https?:\/\//, ''), host, `www.${host}`])
  return forms.has(shown) || forms.has(shown.replace(/^https?:\/\//, ''))
}

function titleFor(href: string, sources: MessageSource[] | undefined): string {
  const match = sources?.find((source) => sameUrl(source.url) === sameUrl(href))
  return match?.title?.trim() || domain(href)
}

/** Drops the parentheses a dropped domain sat in, so "text ([1])" reads "text [1]". */
function stripParens(children: Token[], at: number) {
  const before = children[at - 1]
  const after = children[at + 1]
  if (before?.type !== 'text' || after?.type !== 'text') return
  if (!/\($/.test(before.content) || !/^\)/.test(after.content)) return
  before.content = before.content.replace(/\s*\($/, ' ')
  after.content = after.content.slice(1)
}

export function citations(md: MarkdownIt): void {
  const escape = md.utils.escapeHtml
  md.core.ruler.push('citations', (state: StateCore) => {
    const env = (state.env ?? {}) as CitationEnv
    const prefix = env.refId ?? 'ref'
    const numbers = new Map<string, number>()
    const refs: Array<{ url: string; title: string }> = []
    for (const block of state.tokens) {
      const children = block.children
      if (block.type !== 'inline' || !children) continue
      for (let at = 0; at < children.length; at += 1) {
        const open = children[at]
        if (open.type !== 'link_open') continue
        const href = String(open.attrGet('href') ?? '')
        if (!external(href) || open.attrIndex('data-object') >= 0 || open.attrIndex('data-bucket') >= 0) continue
        let close = at + 1
        while (close < children.length && children[close].type !== 'link_close') close += 1
        if (close >= children.length) break
        const key = sameUrl(href)
        let number = numbers.get(key)
        if (!number) {
          number = refs.length + 1
          numbers.set(key, number)
          refs.push({ url: href, title: titleFor(href, env.sources) })
        }
        const inner = children.slice(at + 1, close)
        const kept = bareText(inner.map((token) => token.content).join(''), href) ? [] : inner
        const mark = new state.Token('html_inline', '', 0)
        mark.content = `<sup class="assistant-cite"><a href="#${prefix}-${number}" data-cite>[${number}]</a></sup>`
        children.splice(at, close - at + 1, ...kept, mark)
        if (!kept.length) stripParens(children, at)
        at += kept.length
      }
    }
    if (!refs.length) return
    const list = new state.Token('html_block', '', 0)
    const items = refs.map((ref, index) =>
      `<li id="${prefix}-${index + 1}"><a href="${escape(ref.url)}" target="_blank" rel="noopener noreferrer">[${index + 1}] ${escape(ref.title)}</a></li>`)
    list.content = `<div class="assistant-references"><p>References</p><ol>${items.join('')}</ol></div>\n`
    state.tokens.push(list)
  })
}
