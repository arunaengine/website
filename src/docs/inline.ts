// Pure parser for the [label](target) links in docs copy. Targets:
// concept:<slug>[#<section>] and page:<routeName> become router locations,
// api:reference targets the in-portal API reference, https:// stays external;
// unknown targets degrade to the plain label, never a broken link.
import { docsTopicBySlug, sectionId } from './v1'

export interface InlineText {
  text: string
}

export interface InlineRouteLink {
  label: string
  to: { name: string; params?: { topic: string }; hash?: string }
}

export interface InlineExternalLink {
  label: string
  href: string
}

export type InlineSegment = InlineText | InlineRouteLink | InlineExternalLink

/** Portal route names docs copy may target; anything else falls back to text. */
const pageRoutes = new Set([
  'dashboard',
  'buckets',
  'datasets',
  'dataset-new',
  'profiles',
  'compute',
  'groups',
  'status',
  'settings',
  'admin',
])

const linkPattern = /\[([^\]]+)\]\(([^()\s]+)\)/g

function resolveTarget(label: string, target: string): InlineSegment {
  if (target.startsWith('concept:')) {
    const [slug, anchor] = target.slice('concept:'.length).split('#', 2)
    const topic = docsTopicBySlug(slug ?? '')
    if (!topic) return { text: label }
    const to: InlineRouteLink['to'] = { name: 'docs', params: { topic: topic.slug } }
    // An anchor must name a real section; a stale one degrades to the topic.
    if (anchor && topic.sections.some((section) => sectionId(section.title) === anchor)) {
      to.hash = `#${anchor}`
    }
    return { label, to }
  }
  if (target === 'api:reference') return { label, to: { name: 'api-reference' } }
  if (target.startsWith('page:')) {
    const name = target.slice('page:'.length)
    if (pageRoutes.has(name)) return { label, to: { name } }
    return { text: label }
  }
  if (target.startsWith('https://')) return { label, href: target }
  return { text: label }
}

export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  const push = (segment: InlineSegment) => {
    const previous = segments[segments.length - 1]
    if ('text' in segment && previous && 'text' in previous) previous.text += segment.text
    else segments.push(segment)
  }
  let cursor = 0
  for (const match of text.matchAll(linkPattern)) {
    const index = match.index ?? 0
    if (index > cursor) push({ text: text.slice(cursor, index) })
    push(resolveTarget(match[1], match[2]))
    cursor = index + match[0].length
  }
  if (cursor < text.length) push({ text: text.slice(cursor) })
  return segments
}
