// Counts switch to the compact form here: below it the grouped digits stay
// readable ("9,999"), above it they stop fitting a dashboard tile.
const COMPACT_THRESHOLD = 10_000

// Compact, tile-sized counts: "1,234" below the threshold, "12.3K" / "4.5M"
// above it. The locale is the browser's, so grouping separators and compact
// suffixes follow the reader's conventions rather than a fixed English form.
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  const options: Intl.NumberFormatOptions =
    n < COMPACT_THRESHOLD ? {} : { notation: 'compact', maximumFractionDigits: 1 }
  return new Intl.NumberFormat(undefined, options).format(n)
}
