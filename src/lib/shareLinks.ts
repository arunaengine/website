// Wording and choices of share links, shared by the Share dialog, Settings and the visitor page.
import type { ShareMode, ShareStatus, ShareTarget } from '@/lib/api'

export const MODE_LABELS: Record<ShareMode, string> = {
  read: 'Read only',
  read_upload: 'Read and upload',
  upload: 'Upload only',
}

export const STATUS_LABELS: Record<ShareStatus, string> = {
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
}

/** Upload modes need a bucket or folder; files and datasets are read only. */
export function modesFor(target: ShareTarget): ShareMode[] {
  return target.kind === 'bucket' || target.kind === 'folder' ? ['read', 'read_upload', 'upload'] : ['read']
}

export const EXPIRY_OPTIONS = [
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'never', label: 'No expiry' },
] as const

export type ExpiryChoice = (typeof EXPIRY_OPTIONS)[number]['value']

/** RFC 3339 end of the chosen span, or undefined for no expiry. */
export function expiryFor(choice: ExpiryChoice, now = new Date()): string | undefined {
  if (choice === 'never') return undefined
  return new Date(now.getTime() + Number(choice) * 86_400_000).toISOString()
}

/** What a link opens, as a path a person reads. */
export function targetPath(target: ShareTarget): string {
  if (target.kind === 'bucket') return target.bucket
  if (target.kind === 'folder') return `${target.bucket}/${target.prefix}`
  if (target.kind === 'object') return `${target.bucket}/${target.key}`
  return target.dataset_id
}

export const KIND_LABELS: Record<ShareTarget['kind'], string> = {
  bucket: 'Bucket',
  folder: 'Folder',
  object: 'File',
  dataset: 'Dataset',
}

export function sameTarget(a: ShareTarget, b: ShareTarget): boolean {
  return a.kind === b.kind && targetPath(a) === targetPath(b)
}
