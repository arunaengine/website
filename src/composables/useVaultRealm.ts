// Where the signed-in user's vault lives, for the vault prompts: the serving realm, never the
// realm of a foreign login. A linked session opens the local account vault.
import { authToken, realmInfo, userInfo } from './aruna/state'
import { realm } from './aruna/realm'
import { homeRealmLabel } from './useFederation'
import { tokenVia } from '@/lib/federation/secret'

export type VaultAction = 'create' | 'unlock' | 'change'

/** The prompt line for a foreign or linked session; null for an ordinary local one. */
export function vaultRealmNote(action: VaultAction): string | null {
  const userId = userInfo.value?.user.user_id ?? ''
  const realmId = userInfo.value?.realm.realm_id ?? realmInfo.value?.realm_id ?? ''
  const name = realm.value.name
  const where = `${name} (${realmId})`
  if (tokenVia(authToken.value)) {
    const vault = `the local account vault in ${where}`
    if (action === 'create') return `Create ${vault}. A linked login opens the same vault.`
    return `${action === 'unlock' ? 'Unlock' : 'Change the passphrase of'} ${vault}.`
  }
  if (!homeRealmLabel(userId, realmId)) return null
  if (action === 'create') return `Create your vault in ${where}. Choose a ${name} vault passphrase.`
  if (action === 'unlock') return `Unlock your vault in ${where}. Enter your ${name} vault passphrase.`
  return `Change the passphrase of your vault in ${where}.`
}
