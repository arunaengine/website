import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.round(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.round(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.round(mo / 12)}y ago`
}

export function truncateMiddle(s: string, head = 8, tail = 6) {
  if (!s || s.length <= head + tail + 1) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}

// Short display form of a `{ulid}@{realm}` user id. The realm suffix is the
// realm's public key (identical for every user shown together) and the ULID
// head is timestamp bits, so the random tail is what disambiguates: keep a
// 4-char head as a visual anchor and grow the tail until unique in `taken`.
export function shortUserId(userId: string, taken?: Iterable<string>): string {
  const ulid = userId.split('@')[0] ?? userId
  const others = new Set<string>()
  for (const other of taken ?? []) {
    if (other !== userId) others.add(other.split('@')[0] ?? other)
  }
  let tail = 4
  const short = () => (ulid.length <= 4 + tail + 1 ? ulid : `${ulid.slice(0, 4)}…${ulid.slice(-tail)}`)
  const clashes = () => [...others].some((other) => other !== ulid && short() === (other.length <= 4 + tail + 1 ? other : `${other.slice(0, 4)}…${other.slice(-tail)}`))
  while (tail < ulid.length && clashes()) tail += 2
  return short()
}

export function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    return navigator.clipboard.writeText(text)
  }
  return Promise.resolve()
}
