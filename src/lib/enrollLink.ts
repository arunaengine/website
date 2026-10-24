// Hand-off the portal produces for a device: the `aruna://enroll` deep link
// (secret, seed URL and realm, form-urlencoded by the node) or the bare
// one-time code, pasted by hand when the deep link cannot be followed.

export interface EnrollInput {
  secret: string
  seedUrl?: string
  realm?: string
  // The realm website that showed the link; the device signs in through it.
  site?: string
}

// A pasted code carries no separators or whitespace; anything shorter than
// this is a typo rather than an enrollment secret.
const MIN_SECRET_LENGTH = 8

function fromLink(raw: string): EnrollInput | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'aruna:') return null
  const target = url.host || url.pathname.replace(/^\/+/, '')
  if (target !== 'enroll') return null
  const secret = url.searchParams.get('secret')?.trim()
  if (!secret) return null
  const input: EnrollInput = { secret }
  const seedUrl = url.searchParams.get('seed')?.trim()
  if (seedUrl) input.seedUrl = seedUrl
  const realm = url.searchParams.get('realm')?.trim()
  if (realm) input.realm = realm
  const site = url.searchParams.get('site')?.trim()
  if (site) input.site = site
  return input
}

/** Reads a pasted deep link or bare code; null when it is neither. */
export function parseEnrollInput(raw: string): EnrollInput | null {
  const value = raw.trim()
  if (!value) return null
  if (value.toLowerCase().startsWith('aruna:')) return fromLink(value)
  if (value.includes('://') || /\s/.test(value)) return null
  return value.length >= MIN_SECRET_LENGTH ? { secret: value } : null
}

/**
 * Names the website that shows a minted link as `site`: the seed node serves no
 * sign-in callback, the website does. The node's own fields stay as minted.
 */
export function withSite(link: string, site: string): string {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return link
  }
  if (url.searchParams.has('site')) return link
  return `${link}${url.search ? '&' : '?'}site=${encodeURIComponent(site)}`
}
