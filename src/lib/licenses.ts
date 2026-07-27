// Human-readable labels for license IRIs: the in-crate license entity's name
// wins, then a well-known Creative Commons / SPDX mapping, then the readable
// IRI tail — so a license tile never shows a truncated bare URL.

import { readableIri } from '@/lib/identifiers'

const CC_NAMES: Record<string, string> = {
  by: 'CC BY',
  'by-sa': 'CC BY-SA',
  'by-nc': 'CC BY-NC',
  'by-nc-sa': 'CC BY-NC-SA',
  'by-nd': 'CC BY-ND',
  'by-nc-nd': 'CC BY-NC-ND',
}

/** Short label for a well-known license IRI (CC, CC0, SPDX), if recognized. */
export function wellKnownLicense(iri: string): string | undefined {
  const trimmed = iri.trim().replace(/\/+$/, '')
  const cc = /creativecommons\.org\/(licenses|publicdomain)\/([^/]+)\/([^/]+)/i.exec(trimmed)
  if (cc) {
    const [, kind, code, version] = cc
    if (kind.toLowerCase() === 'publicdomain') {
      if (code.toLowerCase() === 'zero') return `CC0 ${version}`
      if (code.toLowerCase() === 'mark') return `Public Domain Mark ${version}`
      return undefined
    }
    const name = CC_NAMES[code.toLowerCase()]
    return name ? `${name} ${version}` : undefined
  }
  const spdx = /spdx\.org\/licenses\/([A-Za-z0-9.+-]+?)(?:\.html|\.json)?$/i.exec(trimmed)
  return spdx ? spdx[1] : undefined
}

// Display label chain for a license IRI; `entityName` is the in-crate license
// entity's name when the crate describes one (an IRI echoed as name is noise).
export function licenseLabelOf(iri: string, entityName?: string): string {
  const name = entityName?.trim()
  if (name && name !== iri.trim()) return name
  return wellKnownLicense(iri) ?? readableIri(iri)
}
