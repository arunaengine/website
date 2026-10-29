import { formatNumber } from '@/lib/utils'

// Counts of objects, files, buckets, datasets, runs and jobs: the full number with thousands
// separators ("3,612,345"), never a compact suffix, so one count reads the same everywhere.
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  return formatNumber(n)
}
