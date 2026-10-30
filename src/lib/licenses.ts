// Human-readable labels for license IRIs: the in-crate license entity's name
// wins, then a well-known Creative Commons / SPDX mapping, then the readable
// IRI tail, so a license tile never shows a truncated bare URL.

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

/** A license as people read it: an SPDX Creative Commons id or IRI reads "CC BY 4.0", the rest as given. */
export function licenseText(value: string): string {
  const spdx = /^CC-(BY(?:-NC)?(?:-SA|-ND)?)-(\d\.\d)$/i.exec(value.trim())
  if (spdx) return `CC ${spdx[1]!.toUpperCase()} ${spdx[2]}`
  const zero = /^CC0-(\d\.\d)$/i.exec(value.trim())
  if (zero) return `CC0 ${zero[1]}`
  return wellKnownLicense(value) ?? value
}

/** A license as a link: an SPDX id reads as its license page, anything else stays as given. */
export function licenseUrl(value: string): string {
  const text = value.trim()
  const cc = /^CC-(BY(?:-NC)?(?:-SA|-ND)?)-(\d\.\d)$/i.exec(text)
  if (cc) return `https://creativecommons.org/licenses/${cc[1]!.toLowerCase()}/${cc[2]}/`
  const zero = /^CC0-(\d\.\d)$/i.exec(text)
  if (zero) return `https://creativecommons.org/publicdomain/zero/${zero[1]}/`
  return /^[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(text) ? `https://spdx.org/licenses/${text}.html` : text
}

/** The SPDX id of a license id or link, null when it names none. */
export function spdxId(value: string): string | null {
  const text = value.trim().replace(/\/+$/, '')
  if (/^[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(text)) return text
  const cc = /creativecommons\.org\/licenses\/([a-z-]+)\/(\d\.\d)$/i.exec(text)
  if (cc && CC_NAMES[cc[1]!.toLowerCase()]) return `CC-${cc[1]!.toUpperCase()}-${cc[2]}`
  const zero = /creativecommons\.org\/publicdomain\/zero\/(\d\.\d)$/i.exec(text)
  if (zero) return `CC0-${zero[1]}`
  if (/apache\.org\/licenses\/LICENSE-2\.0$/i.test(text)) return 'Apache-2.0'
  return /spdx\.org\/licenses\/([A-Za-z0-9.+-]+?)(?:\.html|\.json)?$/i.exec(text)?.[1] ?? null
}

// Display label chain for a license IRI; `entityName` is the in-crate license
// entity's name when the crate describes one (an IRI echoed as name is noise).
export function licenseLabelOf(iri: string, entityName?: string): string {
  const name = entityName?.trim()
  if (name && name !== iri.trim()) return name
  const known = licenseText(iri)
  return known !== iri ? known : readableIri(iri)
}
