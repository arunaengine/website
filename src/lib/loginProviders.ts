// Logins the v3 Keycloak offers next to its own accounts. The alias is the
// Keycloak identity provider alias; change this list to add or drop one.

export interface LoginProvider {
  alias: string
  name: string
  description: string
}

export const LOGIN_PROVIDERS: LoginProvider[] = [
  { alias: 'lifescience', name: 'LS Login', description: 'Life science research login (LS-AAI)' },
  { alias: 'iam4nfdi', name: 'IAM4NFDI', description: 'NFDI and German research institutions' },
  { alias: 'gfbio', name: 'GFBio', description: 'German Federation for Biological Data' },
  { alias: 'orcid', name: 'ORCID', description: 'Your ORCID iD' },
  { alias: 'github', name: 'GitHub', description: 'Your GitHub account' },
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
