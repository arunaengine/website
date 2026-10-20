import MarkdownIt from 'markdown-it'
import publicTesting from './aruna-v3-public-testing.md?raw'

export interface NewsImage {
  src: string
  small: string
  alt: string
  width: number
  height: number
}

export interface NewsPost {
  slug: string
  title: string
  teaser: string
  date: string
  author: string
  image: NewsImage
  body: string
}

// Newest first.
export const newsPosts: NewsPost[] = [
  {
    slug: 'aruna-v3-public-testing',
    title: 'Aruna V3 is open for public testing',
    teaser:
      'Aruna V3 is now open for public testing and lets your organization run its own federated data infrastructure. You can keep full authority over your data while sharing datasets and running analyses with partners across institutional borders.',
    date: '2026-10-20',
    author: 'The Aruna Team',
    image: {
      src: '/blog/aruna-v2-to-v3.webp',
      small: '/blog/aruna-v2-to-v3-800.webp',
      alt: 'The move from Aruna V2 to Aruna V3 with federated nodes, data-aware compute, semantic metadata and virtual buckets',
      width: 1400,
      height: 875,
    },
    body: publicTesting,
  },
]

export function findPost(slug: unknown): NewsPost | undefined {
  return newsPosts.find((post) => post.slug === slug)
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}

// html:false escapes raw HTML in the source; markdown-it also rejects unsafe link protocols.
const markdown = new MarkdownIt({ html: false })

export function renderPost(post: NewsPost): string {
  return markdown.render(post.body)
}
