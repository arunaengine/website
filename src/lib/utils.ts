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

function timeSpan(sec: number): string {
  if (sec < 60) return `${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d`
  const mo = Math.round(day / 30)
  if (mo < 12) return `${mo}mo`
  return `${Math.round(mo / 12)}y`
}

// Past timestamps read "5m ago", future ones "in 5m" (e.g. expiry columns).
export function relativeTime(iso: string): string {
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  return sec < 0 ? `in ${timeSpan(-sec)}` : `${timeSpan(sec)} ago`
}

// Compact elapsed-time label ("42s", "3m 10s", "2h 05m") for run durations.
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, '0')}m`
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

// True only for absolute http(s) URLs. Everything else — bare identifiers,
// ORCIDs without a scheme, and unsafe schemes like javascript:/data:/mailto:
// — is rejected, so callers can safely turn the value into an anchor.
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  try {
    const { protocol } = new URL(trimmed)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    return navigator.clipboard.writeText(text)
  }
  return Promise.resolve()
}
