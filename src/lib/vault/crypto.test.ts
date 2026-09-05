import { describe, expect, it } from 'vitest'
import {
  VaultFormatError,
  VaultUnlockError,
  changePassphrase,
  createVault,
  openData,
  parseVaultPayload,
  sealData,
  unlockVault,
  unlockWithRecovery,
} from './crypto'

// The contract's 600 000 iterations are for browsers; the tests only need the flow.
const FAST = { iterations: 500 }

const providers = [
  { id: 'browser-1', kind: 'anthropic', label: 'Work', model: 'claude', apiKey: 'sk-1' },
  { id: 'browser-2', kind: 'openai_compatible', label: 'Local', model: 'llama', baseUrl: 'http://localhost:11434/v1', protocol: 'chat_completions', headers: { 'X-Token': 'h' } },
]

describe('vault crypto', () => {
  it('creates a vault the passphrase opens again', async () => {
    const { payload, masterKey, recoveryCode } = await createVault('correct horse', false, FAST)

    expect(recoveryCode).toBeNull()
    expect(payload.recovery).toBeUndefined()
    expect(payload.keys).toEqual([])
    expect(payload.kdf).toMatchObject({ name: 'pbkdf2-sha256', iterations: 500 })
    expect(masterKey.extractable).toBe(false)
    expect(await openData(masterKey, payload)).toEqual({ providers: [] })

    const reopened = await unlockVault(parseVaultPayload(JSON.stringify(payload)), 'correct horse')
    expect(reopened.extractable).toBe(false)
    expect(await openData(reopened, payload)).toEqual({ providers: [] })
  })

  it('reports a wrong passphrase as such', async () => {
    const { payload } = await createVault('correct horse', false, FAST)

    await expect(unlockVault(payload, 'wrong horse')).rejects.toThrow(VaultUnlockError)
    await expect(unlockVault(payload, 'wrong horse')).rejects.toThrow('Wrong passphrase.')
  })

  it('seals and opens the provider list', async () => {
    const { payload, masterKey } = await createVault('correct horse', false, FAST)

    const sealed = { ...payload, data: await sealData(masterKey, { providers }) }

    expect(sealed.data.sealed).not.toContain('sk-1')
    expect(await openData(masterKey, sealed)).toEqual({ providers })
    // Every seal takes a fresh nonce, so equal data never repeats ciphertext.
    expect((await sealData(masterKey, { providers })).sealed).not.toBe(sealed.data.sealed)
  })

  it('keeps the data and the recovery code across a passphrase change', async () => {
    const created = await createVault('first', true, FAST)
    const before = { ...created.payload, data: await sealData(created.masterKey, { providers }) }

    const after = await changePassphrase(before, { passphrase: 'first' }, 'second')

    expect(after.data).toEqual(before.data)
    expect(after.recovery).toEqual(before.recovery)
    expect(after.kdf.salt).not.toBe(before.kdf.salt)
    await expect(unlockVault(after, 'first')).rejects.toThrow('Wrong passphrase.')
    const key = await unlockVault(after, 'second')
    expect(await openData(key, after)).toEqual({ providers })
    const recovered = await unlockWithRecovery(after, created.recoveryCode ?? '')
    expect(await openData(recovered, after)).toEqual({ providers })
  })

  it('opens the vault with the recovery code as typed', async () => {
    const { payload, recoveryCode } = await createVault('first', true, FAST)
    const code = recoveryCode ?? ''

    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/)
    const key = await unlockWithRecovery(payload, code.toLowerCase().replace(/-/g, ' '))
    expect(await openData(key, payload)).toEqual({ providers: [] })
    // The last character holds one used bit and four of padding, so a full character is flipped.
    const flipped = code.slice(0, 5) + (code[5] === 'A' ? 'B' : 'A') + code.slice(6)
    await expect(unlockWithRecovery(payload, flipped)).rejects.toThrow('The recovery code is wrong.')
    await expect(unlockWithRecovery(payload, 'short')).rejects.toThrow('The recovery code is wrong.')
  })

  it('sets a new passphrase from the recovery code', async () => {
    // A user who forgot the passphrase recovers with the code and picks a new one.
    const { payload, recoveryCode } = await createVault('forgotten', true, FAST)

    const after = await changePassphrase(payload, { recoveryCode: recoveryCode ?? '' }, 'remembered')

    expect(await openData(await unlockVault(after, 'remembered'), after)).toEqual({ providers: [] })
    await expect(changePassphrase(payload, { recoveryCode: 'nope' }, 'x')).rejects.toThrow(VaultUnlockError)
  })

  it('refuses a vault without a recovery code on the recovery path', async () => {
    const { payload } = await createVault('first', false, FAST)

    await expect(unlockWithRecovery(payload, 'A'.repeat(52))).rejects.toThrow('no recovery code')
  })

  it('refuses a payload with an unknown version', async () => {
    const { payload } = await createVault('first', false, FAST)

    expect(() => parseVaultPayload(JSON.stringify({ ...payload, version: 2 }))).toThrow(VaultFormatError)
    expect(() => parseVaultPayload(JSON.stringify({ ...payload, version: 2 }))).toThrow('newer portal')
    expect(() => parseVaultPayload('not json')).toThrow(VaultFormatError)
    expect(() => parseVaultPayload(JSON.stringify({ ...payload, master: {} }))).toThrow(VaultFormatError)
  })
})
