// The S3 naming rules the node enforces before any Aruna code runs, mirrored
// here so a name is refused with its reason before the request leaves the
// browser. Keep the sentences identical to the ones the node answers with.

export const BUCKET_NAME_REQUIREMENT =
  '3 to 63 characters: lowercase letters, digits, dots and dashes, starting and ending with a letter or digit.'

/** S3 object keys are capped at 1024 UTF-8 bytes. */
export const OBJECT_KEY_MAX_BYTES = 1024

const OCTET = /^(0|[1-9]\d{0,2})$/

// Rust's IPv4 parser, which the node's rule reads through: four decimal
// octets, no leading zeros.
function looksLikeIpAddress(name: string): boolean {
  const parts = name.split('.')
  return parts.length === 4 && parts.every((part) => OCTET.test(part) && Number(part) <= 255)
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

/** The rule a bucket name breaks, or null when the node would accept it. */
export function bucketNameProblem(name: string): string | null {
  if (name.length < 3) return 'Bucket names must contain at least 3 characters.'
  if (name.length > 63) return 'Bucket names must contain at most 63 characters.'
  if (!/^[a-z0-9.-]+$/.test(name))
    return 'Bucket names may only contain lowercase letters, digits, dots and dashes.'
  if (!/^[a-z0-9]/.test(name) || !/[a-z0-9]$/.test(name))
    return 'Bucket names must start and end with a letter or a digit.'
  if (name.includes('..')) return 'Bucket names must not contain two dots in a row.'
  if (looksLikeIpAddress(name)) return 'Bucket names must not look like an IP address.'
  if (name.startsWith('xn--')) return 'Bucket names must not start with xn--.'
  return null
}

/** The rule a folder name breaks; a folder is one segment of an object key. */
export function folderNameProblem(name: string): string | null {
  if (!name) return 'A folder needs a name.'
  if (name.includes('/')) return 'A folder name cannot contain a slash.'
  if (name === '.' || name === '..') return 'A folder cannot be named "." or "..".'
  if (utf8Bytes(name) > OBJECT_KEY_MAX_BYTES)
    return `A folder name may be at most ${OBJECT_KEY_MAX_BYTES} bytes.`
  return null
}

/** The rule an object key breaks, or null when it is a usable key. */
export function objectKeyProblem(key: string): string | null {
  if (!key) return 'An object key needs at least one character.'
  if (key.startsWith('/')) return 'An object key cannot start with a slash.'
  if (key.split('/').some((segment) => !segment))
    return 'An object key cannot contain an empty path segment.'
  if (key.split('/').some((segment) => segment === '.' || segment === '..'))
    return 'An object key cannot contain a "." or ".." segment.'
  if (utf8Bytes(key) > OBJECT_KEY_MAX_BYTES)
    return `An object key may be at most ${OBJECT_KEY_MAX_BYTES} bytes.`
  return null
}
