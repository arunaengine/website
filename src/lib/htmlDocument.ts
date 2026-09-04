// Stored HTML, made safe to show in a frame. Everything that would run code or
// reach the network is removed here, and the frame the caller mounts adds the
// sandbox and the policy on top: a report renders, nothing else happens.

/** How much markup a preview renders; a bigger file is cut, never rendered whole. */
export const MAX_PREVIEW_HTML = 4 * 1024 * 1024

const DROPPED_TAGS = /<\s*(script|iframe|frame|frameset|object|embed|applet|link|base|meta|form|noscript)\b[^>]*>/gi
const CLOSING_DROPPED = /<\s*\/\s*(script|iframe|frame|frameset|object|embed|applet|form|noscript)\s*>/gi
const SCRIPT_BLOCK = /<\s*script\b[\s\S]*?(?:<\s*\/\s*script\s*>|$)/gi
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g
const STYLE_BLOCK = /(<\s*style\b[^>]*>)([\s\S]*?)(<\s*\/\s*style\s*>)/gi
const TAG = /<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
const ATTRIBUTE = /([\w:.-]+)(\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g
// Every attribute that can name a resource or a target; each one is checked.
const URL_ATTRIBUTES = new Set([
  'src', 'href', 'srcset', 'poster', 'data', 'action', 'formaction', 'background',
  'xlink:href', 'ping', 'cite', 'manifest', 'archive', 'longdesc', 'usemap', 'profile',
])
const CSS_URL = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi
const CSS_IMPORT = /@import[^;]*;?/gi

/** Inline images are kept; everything else that points outward is dropped. */
function keepsUrl(name: string, value: string): boolean {
  const target = value.trim().toLowerCase()
  if (!target) return true
  if (name === 'href' || name === 'xlink:href' || name === 'cite') return target.startsWith('#')
  return target.startsWith('data:image/')
}

function unquote(value: string): string {
  const trimmed = value.trim()
  const quote = trimmed.charAt(0)
  return quote === '"' || quote === "'" ? trimmed.slice(1, -1) : trimmed
}

function cleanStyle(value: string, count: () => void): string {
  return value.replace(CSS_IMPORT, () => {
    count()
    return ''
  }).replace(CSS_URL, (whole, _quote: string, target: string) => {
    if (target.trim().toLowerCase().startsWith('data:image/')) return whole
    count()
    return 'none'
  })
}

export interface SafeHtml {
  /** A whole document, policy first, ready for a sandboxed frame's srcdoc. */
  html: string
  /** How many scripts, frames and outward references were removed. */
  removed: number
  /** True when the file was longer than the preview renders. */
  truncated: boolean
}

const POLICY = '<meta http-equiv="Content-Security-Policy" '
  + `content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">`

export function safeHtmlDocument(source: string): SafeHtml {
  const truncated = source.length > MAX_PREVIEW_HTML
  let removed = 0
  const count = () => {
    removed += 1
  }
  let body = truncated ? source.slice(0, MAX_PREVIEW_HTML) : source
  body = body.replace(COMMENT, '')
  body = body.replace(SCRIPT_BLOCK, () => {
    count()
    return ''
  })
  body = body.replace(STYLE_BLOCK, (_whole, open: string, css: string, close: string) =>
    `${open}${cleanStyle(css, count)}${close}`)
  body = body.replace(DROPPED_TAGS, (whole, tag: string) => {
    // A stylesheet link and a meta refresh both reach out; a plain meta does not.
    if (tag.toLowerCase() === 'meta' && !/http-equiv/i.test(whole)) return whole
    count()
    return ''
  })
  body = body.replace(CLOSING_DROPPED, '')
  body = body.replace(TAG, (whole, tag: string, attrs: string) => {
    if (!attrs.trim()) return whole
    const kept = attrs.replace(ATTRIBUTE, (attribute, name: string, assignment?: string) => {
      const key = name.toLowerCase()
      const value = assignment ? unquote(assignment.slice(assignment.indexOf('=') + 1)) : ''
      if (key.startsWith('on')) {
        count()
        return ''
      }
      if (key === 'style') return `style="${cleanStyle(value, count).replace(/"/g, '&quot;')}"`
      if (URL_ATTRIBUTES.has(key) && !keepsUrl(key, value)) {
        count()
        return ''
      }
      return attribute
    })
    return `<${tag}${kept.replace(/\s+/g, ' ').replace(/\s+>/, '>')}>`
  })
  return {
    html: `<!doctype html><html><head>${POLICY}</head><body>${body}</body></html>`,
    removed,
    truncated,
  }
}
