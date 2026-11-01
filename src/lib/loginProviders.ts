// Logins the v3 Keycloak offers next to its own accounts. The alias is the
// Keycloak identity provider alias; change this list to add or drop one.

import lifescienceLogo from '@/assets/brand/providers/ls-ri.webp'
import gfbioLogo from '@/assets/brand/providers/gfbio.webp'
import nfdiLogo from '@/assets/brand/providers/iam4nfdi.webp'
import gfbioLight from '@/assets/brand/providers/gfbio-light.webp'
import nfdiLight from '@/assets/brand/providers/iam4nfdi-light.webp'

export interface LoginProvider {
  alias: string
  name: string
  description: string
  logo: string
  // A copy for light backgrounds when the logo is drawn in white.
  logoLight?: string
}

// ORCID and GitHub come in through LS Login and NFDI AAI, so they are not offered on their own.
export const LOGIN_PROVIDERS: LoginProvider[] = [
  { alias: 'lifescience', name: 'LifeScience RI', description: 'Life Science Login (LS AAI)', logo: lifescienceLogo },
  { alias: 'gfbio', name: 'GFBio SSO', description: 'German Federation for Biological Data', logo: gfbioLogo, logoLight: gfbioLight },
  { alias: 'iam4nfdi', name: 'NFDI AAI', description: 'NFDI and German research institutions', logo: nfdiLogo, logoLight: nfdiLight },
]

/** Only realms whose issuer lives under this domain have the providers above. */
export const PROVIDER_DOMAIN = 'aruna-engine.org'

/** True when the realm's identity provider is the Aruna Keycloak with these logins. */
export function offersProviders(issuer: string | undefined): boolean {
  if (!issuer) return false
  try {
    const host = new URL(issuer).hostname
    return host === PROVIDER_DOMAIN || host.endsWith(`.${PROVIDER_DOMAIN}`)
  } catch {
    return false
  }
}

/** The Keycloak account page where linked logins are listed and removed. */
export function linkedAccountsUrl(issuer: string): string {
  return `${issuer.replace(/\/+$/, '')}/account/account-security/linked-accounts`
}
