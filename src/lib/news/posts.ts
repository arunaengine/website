import MarkdownIt from 'markdown-it'
import publicTesting from './aruna-v3-public-testing.md?raw'
import researchDataFair from './making-research-data-more-fair.md?raw'
import kubeconEu2025 from './aruna-at-kubecon-eu-2025.md?raw'
import handsOnWorkshop from './successful-hands-on-workshop.md?raw'
import saltLakeCity from './aruna-goes-salt-lake-city.md?raw'
import arunaRelease2 from './release-of-aruna-version-2-0.md?raw'

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
  {
    slug: 'making-research-data-more-fair',
    title: 'Making Research Data More FAIR',
    teaser:
      'While Research Object Crates (RO-Crate) provide a standardized way to package data with metadata, existing tools struggle with extremely large datasets and distributed storage environments. At Biohackathon Germany 2025, these problems were tackled head-on within our project',
    date: '2026-02-16',
    author: 'The Aruna Team',
    image: {
      src: '/blog/making-research-data-more-fair/header.webp',
      small: '/blog/making-research-data-more-fair/header-800.webp',
      alt: 'Group photo of all on-site participants at the BioHackathon Germany 2025. Photo taken by Daniel Wibberg.',
      width: 1024,
      height: 640,
    },
    body: researchDataFair,
  },
  {
    slug: 'aruna-at-kubecon-eu-2025',
    title: 'Aruna at KubeCon EU 2025',
    teaser:
      'The Aruna team is excited to announce its participation at KubeCon + CloudNativeCon Europe 2025, taking place in London from April 1st to 4th.',
    date: '2025-01-27',
    author: 'The Aruna Team',
    image: {
      src: '/blog/aruna-at-kubecon-eu-2025/header.webp',
      small: '/blog/aruna-at-kubecon-eu-2025/header-800.webp',
      alt: 'The KubeCon / CloudNativeCon EU 2025 logo.',
      width: 960,
      height: 600,
    },
    body: kubeconEu2025,
  },
  {
    slug: 'successful-hands-on-workshop',
    title: 'Successful hands-on workshop',
    teaser:
      'On December 4th and 5th, 2024, the Aruna development team had the pleasure of participating in the NFDI4Microbiota annual conference, where they conducted an engaging and informative workshop.',
    date: '2024-12-09',
    author: 'The Aruna Team',
    image: {
      src: '/blog/successful-hands-on-workshop/header.webp',
      small: '/blog/successful-hands-on-workshop/header-800.webp',
      alt: 'Group photo of the NFDI4MIcrobiota annual conference participants standing on a staircase.',
      width: 960,
      height: 600,
    },
    body: handsOnWorkshop,
  },
  {
    slug: 'aruna-goes-salt-lake-city',
    title: 'Aruna goes Salt Lake City',
    teaser:
      'The Aruna development team recently embarked on an exciting journey to Salt Lake City, where they secured a coveted presentation slot in the Poster Session track.',
    date: '2024-11-18',
    author: 'The Aruna Team',
    image: {
      src: '/blog/aruna-goes-salt-lake-city/header.webp',
      small: '/blog/aruna-goes-salt-lake-city/header-800.webp',
      alt: 'Aruna development team group photo in front of a KubeCon booth in the background.',
      width: 960,
      height: 600,
    },
    body: saltLakeCity,
  },
  {
    slug: 'release-of-aruna-version-2-0',
    title: 'Release of Aruna version 2.0',
    teaser:
      'We are excited to announce the release of Aruna version 2.0! This major update brings a host of new features, enhancements, and performance improvements designed to elevate your user experience.',
    date: '2024-07-17',
    author: 'The Aruna Team',
    image: {
      src: '/blog/release-of-aruna-version-2-0/header.webp',
      small: '/blog/release-of-aruna-version-2-0/header-800.webp',
      alt: 'Banner saying that Aruna version 2.0 has arrived, with the tagline FAIR, souvereign, cloud native data orchestration',
      width: 960,
      height: 600,
    },
    body: arunaRelease2,
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
