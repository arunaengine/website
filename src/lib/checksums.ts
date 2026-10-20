import type { DrsObjectResponse } from './contentIdentity'

export interface FileChecksum {
  label: string
  value: string
}

const LABELS: Record<string, string> = {
  blake3: 'BLAKE3',
  sha256: 'SHA-256',
  sha1: 'SHA-1',
  md5: 'MD5',
  crc64nvme: 'CRC64NVME',
  crc32c: 'CRC32C',
  crc32: 'CRC32',
}
const ORDER = Object.keys(LABELS)

/** The stored checksums of a file as hex, strongest first; unknown kinds follow by name. */
export function fileChecksums(object: DrsObjectResponse): FileChecksum[] {
  const rank = (type: string) => (ORDER.includes(type) ? ORDER.indexOf(type) : ORDER.length)
  return (object.checksums ?? [])
    .map((entry) => ({ type: entry.type?.trim().toLowerCase() ?? '', value: entry.checksum?.trim().toLowerCase() ?? '' }))
    .filter((entry) => entry.type && entry.value)
    .sort((a, b) => rank(a.type) - rank(b.type) || a.type.localeCompare(b.type))
    .map((entry) => ({ label: LABELS[entry.type] ?? entry.type.toUpperCase(), value: entry.value }))
}
