// Browser secrets of one federation attempt. The secret stays in this portal; only its
// SHA-256 (the nonce) goes into signed requests and through the popup handshake.
import { fromBase64Url } from '@/lib/vault/hpke'
import { toHex } from './descriptor'

const LINK_ATTEMPT = 'aruna-link-attempt-v1'

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16))
}

/** A fresh 32 byte secret and its nonce, both hex. */
export async function newSecret(): Promise<{ secret: string; nonce: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return { secret: toHex(bytes), nonce: await sha256Hex(bytes) }
}

/** The nonce of a link attempt: the secret bound to the caller's local session id. */
export async function linkNonce(sessionId: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const parts = [encoder.encode(LINK_ATTEMPT), [0], encoder.encode(sessionId), [0], hexBytes(secret)]
  return sha256Hex(Uint8Array.from(parts.flatMap((part) => Array.from(part))))
}

/** The `sid` claim of a bearer token, read without checking it; the node checks it. */
export function tokenSessionId(token: string): string | null {
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(token.split('.')[1] ?? ''))) as {
      sid?: unknown
    }
    return typeof claims.sid === 'string' ? claims.sid : null
  } catch {
    return null
  }
}
